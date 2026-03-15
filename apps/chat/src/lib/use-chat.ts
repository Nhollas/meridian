import type { RuntimeEventEnvelope } from "@meridian/contracts/runtime-events";
import {
	startTransition,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { ToolCallViewModel } from "./contracts";
import {
	mapRuntimeToolEventToViewModel,
	mapRuntimeTurnToolCallsToViewModels,
} from "./runtime-event-mappers";
import { readSSEStream } from "./stream-reader";
import type { ChatMessageStatus, ChatMessageViewModel } from "./view-models";

const API_URL =
	typeof process !== "undefined"
		? (process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3201")
		: "http://localhost:3201";

const SESSION_STORAGE_KEY = "meridian.chat.session-id";

type TurnState = {
	assistantMessageId: string;
	content: string;
	toolCalls: ToolCallViewModel[];
	frameId: number | null;
};

export function useChat() {
	const [messages, setMessages] = useState<ChatMessageViewModel[]>([]);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [isPending, setIsPending] = useState(false);
	const [isError, setIsError] = useState(false);

	const activeTurnsRef = useRef<Map<string, TurnState>>(new Map());
	const pendingEventsRef = useRef<Map<string, RuntimeEventEnvelope[]>>(
		new Map(),
	);

	useEffect(() => {
		const id = getOrCreateSessionId();
		setSessionId(id);
	}, []);

	const processEvent = useCallback(
		(event: RuntimeEventEnvelope, turn: TurnState) => {
			const flushState = (status: ChatMessageStatus = "streaming") => {
				turn.frameId = null;
				const contentSnapshot = turn.content;
				const toolCallsSnapshot = turn.toolCalls;

				startTransition(() => {
					setMessages((prev) =>
						updateAssistantMessage(prev, turn.assistantMessageId, {
							content: contentSnapshot,
							toolCalls: toolCallsSnapshot,
							status,
						}),
					);
				});
			};

			const scheduleFlush = () => {
				if (turn.frameId !== null) return;
				turn.frameId = window.requestAnimationFrame(() => flushState());
			};

			if (event.type === "assistant.delta") {
				turn.content += event.payload.delta;
				scheduleFlush();
				return;
			}

			if (
				event.type === "tool.started" ||
				event.type === "tool.completed" ||
				event.type === "tool.failed"
			) {
				turn.toolCalls = upsertToolCall(
					turn.toolCalls,
					mapRuntimeToolEventToViewModel(event),
				);
				scheduleFlush();
				return;
			}

			if (event.type === "turn.completed") {
				turn.content = event.payload.content;
				turn.toolCalls = mapRuntimeTurnToolCallsToViewModels(
					event.payload.toolCalls,
				);

				if (turn.frameId !== null) {
					window.cancelAnimationFrame(turn.frameId);
				}

				flushState("complete");
				activeTurnsRef.current.delete(event.turnId);
				setIsPending(false);
				return;
			}

			if (event.type === "turn.failed") {
				if (turn.frameId !== null) {
					window.cancelAnimationFrame(turn.frameId);
				}

				turn.content =
					turn.content ||
					"Something went wrong reaching the agent. Check the console for details.";

				startTransition(() => {
					setMessages((prev) =>
						updateAssistantMessage(prev, turn.assistantMessageId, {
							content: turn.content,
							toolCalls: turn.toolCalls,
							status: "error",
						}),
					);
				});

				activeTurnsRef.current.delete(event.turnId);
				setIsPending(false);
				setIsError(true);
				console.error("Chat API error:", event.payload.error);
			}
		},
		[],
	);

	const handleSSEEvent = useCallback(
		(event: RuntimeEventEnvelope) => {
			const turn = activeTurnsRef.current.get(event.turnId);
			if (!turn) {
				const pending = pendingEventsRef.current.get(event.turnId) ?? [];
				pending.push(event);
				pendingEventsRef.current.set(event.turnId, pending);
				return;
			}

			processEvent(event, turn);
		},
		[processEvent],
	);

	const registerTurn = useCallback(
		(turnId: string, assistantMessageId: string) => {
			const turn: TurnState = {
				assistantMessageId,
				content: "",
				toolCalls: [],
				frameId: null,
			};
			activeTurnsRef.current.set(turnId, turn);

			// Replay any events that arrived before registration
			const pending = pendingEventsRef.current.get(turnId);
			if (pending) {
				pendingEventsRef.current.delete(turnId);
				for (const event of pending) {
					processEvent(event, turn);
				}
			}
		},
		[processEvent],
	);

	// Open persistent SSE connection
	useEffect(() => {
		if (!sessionId) return;

		const abortController = new AbortController();

		void (async () => {
			try {
				const res = await fetch(`${API_URL}/api/sessions/${sessionId}/events`, {
					signal: abortController.signal,
				});

				await readSSEStream(res, handleSSEEvent);
			} catch (error) {
				if (error instanceof DOMException && error.name === "AbortError") {
					return;
				}
				console.error("SSE connection error:", error);
			}
		})();

		return () => abortController.abort();
	}, [sessionId, handleSSEEvent]);

	const sendMessage = useCallback(
		async (content: string) => {
			const activeSessionId = sessionId ?? getOrCreateSessionId();
			if (activeSessionId !== sessionId) {
				setSessionId(activeSessionId);
			}

			const userMessage = createMessage("user", content);
			const assistantMessage = createMessage("assistant", "", {
				status: "streaming",
				toolCalls: [],
			});

			setMessages((prev) => [...prev, userMessage, assistantMessage]);
			setIsPending(true);
			setIsError(false);

			try {
				const res = await fetch(`${API_URL}/api/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"session-id": activeSessionId,
					},
					body: JSON.stringify({ message: content }),
				});

				if (!res.ok) {
					throw new Error(`Request failed: ${res.status}`);
				}

				const { turnId } = (await res.json()) as { turnId: string };
				registerTurn(turnId, assistantMessage.id);
			} catch (error) {
				startTransition(() => {
					setMessages((prev) =>
						updateAssistantMessage(prev, assistantMessage.id, {
							content:
								"Something went wrong reaching the agent. Check the console for details.",
							status: "error",
						}),
					);
				});

				setIsPending(false);
				setIsError(true);
				console.error("Chat API error:", error);
			}
		},
		[sessionId, registerTurn],
	);

	return {
		messages,
		sessionId,
		isPending,
		isError,
		sendMessage,
	};
}

function createMessage(
	role: "user" | "assistant",
	content: string,
	options?: {
		status?: ChatMessageStatus;
		toolCalls?: ToolCallViewModel[];
	},
): ChatMessageViewModel {
	return {
		id: crypto.randomUUID(),
		role,
		content,
		...(options?.toolCalls && { toolCalls: options.toolCalls }),
		...(options?.status && { status: options.status }),
		timestamp: new Date().toISOString(),
	};
}

function getOrCreateSessionId() {
	const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
	if (existing) {
		return existing;
	}

	const sessionId = crypto.randomUUID();
	window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
	return sessionId;
}

function updateAssistantMessage(
	messages: ChatMessageViewModel[],
	messageId: string,
	patch: Partial<ChatMessageViewModel>,
) {
	return messages.map((message) =>
		message.id === messageId ? { ...message, ...patch } : message,
	);
}

function upsertToolCall(
	toolCalls: ToolCallViewModel[],
	nextToolCall: ToolCallViewModel,
) {
	const existingIndex = toolCalls.findIndex(
		(toolCall) => toolCall.id === nextToolCall.id,
	);

	if (existingIndex === -1) {
		return [...toolCalls, nextToolCall];
	}

	return toolCalls.map((toolCall, index) =>
		index === existingIndex ? { ...toolCall, ...nextToolCall } : toolCall,
	);
}
