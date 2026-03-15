import type { RuntimeEventEnvelope } from "@meridian/contracts/runtime-events";
import { useMutation } from "@tanstack/react-query";
import { startTransition, useEffect, useRef, useState } from "react";
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

type TurnHandler = {
	assistantMessageId: string;
	flushAssistantState: (status?: ChatMessageStatus) => void;
	scheduleFlush: () => void;
	streamedContent: string;
	streamedToolCalls: ToolCallViewModel[];
};

function dispatchEvent(
	turnHandlers: Map<string, TurnHandler>,
	handler: TurnHandler,
	event: RuntimeEventEnvelope,
) {
	if (event.type === "assistant.delta") {
		handler.streamedContent += event.payload.delta;
		handler.scheduleFlush();
		return;
	}

	if (
		event.type === "tool.started" ||
		event.type === "tool.completed" ||
		event.type === "tool.failed"
	) {
		handler.streamedToolCalls = upsertToolCall(
			handler.streamedToolCalls,
			mapRuntimeToolEventToViewModel(event),
		);
		handler.scheduleFlush();
		return;
	}

	if (event.type === "turn.completed") {
		handler.streamedContent = event.payload.content;
		handler.streamedToolCalls = mapRuntimeTurnToolCallsToViewModels(
			event.payload.toolCalls,
		);
		handler.flushAssistantState("complete");
		turnHandlers.delete(event.turnId);
		return;
	}

	if (event.type === "turn.failed") {
		handler.flushAssistantState("error");
		turnHandlers.delete(event.turnId);
	}
}

export function useChat() {
	const [messages, setMessages] = useState<ChatMessageViewModel[]>([]);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const turnHandlersRef = useRef(new Map<string, TurnHandler>());
	const eventBufferRef = useRef(new Map<string, RuntimeEventEnvelope[]>());

	function registerTurnHandler(turnId: string, handler: TurnHandler) {
		turnHandlersRef.current.set(turnId, handler);

		const buffered = eventBufferRef.current.get(turnId);
		if (buffered) {
			eventBufferRef.current.delete(turnId);
			for (const event of buffered) {
				dispatchEvent(turnHandlersRef.current, handler, event);
			}
		}
	}

	useEffect(() => {
		const activeSessionId = getOrCreateSessionId();
		setSessionId(activeSessionId);

		const abortController = new AbortController();

		void (async () => {
			try {
				const res = await fetch(
					`${API_URL}/api/sessions/${activeSessionId}/events`,
					{ signal: abortController.signal },
				);

				if (!res.ok) {
					console.error("SSE connection failed:", res.status);
					return;
				}

				await readSSEStream(res, (event) => {
					const handler = turnHandlersRef.current.get(event.turnId);
					if (handler) {
						dispatchEvent(turnHandlersRef.current, handler, event);
						return;
					}

					let buffer = eventBufferRef.current.get(event.turnId);
					if (!buffer) {
						buffer = [];
						eventBufferRef.current.set(event.turnId, buffer);
					}
					buffer.push(event);
				});
			} catch (error) {
				if (abortController.signal.aborted) {
					return;
				}
				console.error("SSE stream error:", error);
			}
		})();

		return () => {
			abortController.abort();
		};
	}, []);

	const {
		mutate: sendMessage,
		isPending,
		isError,
	} = useMutation({
		retry: false,
		mutationFn: async (content: string) => {
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

			let frameId: number | null = null;
			const turnState = {
				assistantMessageId: assistantMessage.id,
				streamedContent: "",
				streamedToolCalls: [] as ToolCallViewModel[],
				flushAssistantState(status: ChatMessageStatus = "streaming") {
					if (frameId !== null) {
						window.cancelAnimationFrame(frameId);
					}
					frameId = null;
					const contentSnapshot = turnState.streamedContent;
					const toolCallsSnapshot = turnState.streamedToolCalls;

					startTransition(() => {
						setMessages((prev) =>
							updateAssistantMessage(prev, assistantMessage.id, {
								content: contentSnapshot,
								toolCalls: toolCallsSnapshot,
								status,
							}),
						);
					});
				},
				scheduleFlush() {
					if (frameId !== null) {
						return;
					}
					frameId = window.requestAnimationFrame(() => {
						turnState.flushAssistantState();
					});
				},
			};

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

				await new Promise<void>((resolve, reject) => {
					const originalFlush = turnState.flushAssistantState.bind(turnState);
					turnState.flushAssistantState = (
						status: ChatMessageStatus = "streaming",
					) => {
						originalFlush(status);
						if (status === "complete" || status === "error") {
							window.clearTimeout(timeout);
							resolve();
						}
					};

					const timeout = window.setTimeout(() => {
						turnHandlersRef.current.delete(turnId);
						reject(new Error("Turn timed out"));
					}, 300_000);

					registerTurnHandler(turnId, turnState);
				});
			} catch (error) {
				if (frameId !== null) {
					window.cancelAnimationFrame(frameId);
				}

				startTransition(() => {
					setMessages((prev) =>
						updateAssistantMessage(prev, assistantMessage.id, {
							content:
								turnState.streamedContent ||
								"Something went wrong reaching the agent. Check the console for details.",
							toolCalls: turnState.streamedToolCalls,
							status: "error",
						}),
					);
				});

				throw error;
			}
		},
		onError: (error) => {
			console.error("Chat API error:", error);
		},
	});

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
