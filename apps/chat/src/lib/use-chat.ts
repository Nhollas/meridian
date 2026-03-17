import { upsertById } from "@meridian/contracts/collections";
import type { RuntimeEventEnvelope } from "@meridian/contracts/runtime-events";
import { useMutation } from "@tanstack/react-query";
import { startTransition, useEffect, useRef, useState } from "react";
import type { ToolCallViewModel } from "./contracts";
import {
	mapRuntimeToolEventToViewModel,
	mapRuntimeTurnToolCallsToViewModels,
} from "./runtime-event-mappers";
import { readSSEStream } from "./stream-reader";
import type {
	BackgroundTaskViewModel,
	ChatMessageStatus,
	ChatMessageViewModel,
} from "./view-models";

const API_URL =
	typeof process !== "undefined"
		? (process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3201")
		: "http://localhost:3201";

const SESSION_STORAGE_KEY = "meridian.chat.session-id";
const TURN_TIMEOUT_MS = 300_000;
const SSE_RECONNECT_DELAY_MS = 1000;
const BACKGROUND_TASK_DISMISS_MS = 4000;

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
		handler.streamedToolCalls = upsertById(
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
	const [backgroundTasks, setBackgroundTasks] = useState<
		BackgroundTaskViewModel[]
	>([]);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const turnHandlersRef = useRef(new Map<string, TurnHandler>());
	const eventBufferRef = useRef(new Map<string, RuntimeEventEnvelope[]>());
	const pendingUserTurnRef = useRef(false);
	const dismissTimeouts = useRef(new Set<ReturnType<typeof setTimeout>>());
	const sseReadyRef = useRef(createDeferred());

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

		function handleSSEEvent(event: RuntimeEventEnvelope) {
			if (event.type === "background_task.started") {
				startTransition(() => {
					setBackgroundTasks((prev) => {
						if (prev.some((t) => t.id === event.payload.taskId)) return prev;
						return [
							...prev,
							{
								id: event.payload.taskId,
								label: event.payload.label,
								startedAt: event.payload.startedAt,
								status: "running",
							},
						];
					});
				});
				return;
			}

			if (event.type === "background_task.completed") {
				const { taskId, status, endedAt } = event.payload;
				startTransition(() => {
					setBackgroundTasks((prev) =>
						prev.map((task) =>
							task.id === taskId ? { ...task, status, endedAt } : task,
						),
					);
				});
				const timeoutId = setTimeout(() => {
					dismissTimeouts.current.delete(timeoutId);
					startTransition(() => {
						setBackgroundTasks((prev) =>
							prev.filter((task) => task.id !== taskId),
						);
					});
				}, BACKGROUND_TASK_DISMISS_MS);
				dismissTimeouts.current.add(timeoutId);
				return;
			}

			const handler = turnHandlersRef.current.get(event.turnId);
			if (handler) {
				dispatchEvent(turnHandlersRef.current, handler, event);
				return;
			}

			const buffered = eventBufferRef.current.get(event.turnId);
			if (buffered) {
				buffered.push(event);
				return;
			}

			// If a user turn POST is in-flight, buffer the event — the handler
			// will be registered once the POST response arrives with the turnId.
			if (pendingUserTurnRef.current) {
				eventBufferRef.current.set(event.turnId, [event]);
				return;
			}

			// Unknown turnId with no pending user turn — server-initiated turn.
			const assistantMessage = createMessage("assistant", "", {
				status: "streaming",
				toolCalls: [],
			});

			startTransition(() => {
				setMessages((prev) => [...prev, assistantMessage]);
			});

			const turnState: TurnHandler = {
				assistantMessageId: assistantMessage.id,
				streamedContent: "",
				streamedToolCalls: [],
				flushAssistantState(status: ChatMessageStatus = "streaming") {
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
					turnState.flushAssistantState();
				},
			};

			turnHandlersRef.current.set(event.turnId, turnState);
			dispatchEvent(turnHandlersRef.current, turnState, event);
		}

		void (async () => {
			while (!abortController.signal.aborted) {
				try {
					const res = await fetch(
						`${API_URL}/api/sessions/${activeSessionId}/events`,
						{ signal: abortController.signal },
					);

					if (!res.ok) {
						console.error("SSE connection failed:", res.status);
					} else {
						sseReadyRef.current.resolve();
						await readSSEStream(res, handleSSEEvent);
					}
				} catch (error) {
					if (abortController.signal.aborted) {
						return;
					}
					console.error("SSE stream error:", error);
				}

				// Connection lost — prepare a new readiness gate and reconnect
				sseReadyRef.current = createDeferred();
				await sleep(SSE_RECONNECT_DELAY_MS);
			}
		})();

		return () => {
			abortController.abort();
			for (const id of dismissTimeouts.current) {
				clearTimeout(id);
			}
			dismissTimeouts.current.clear();
		};
	}, []);

	const {
		mutate: sendMessage,
		isPending,
		isError,
	} = useMutation({
		retry: false,
		mutationFn: async (content: string) => {
			await sseReadyRef.current.promise;

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

			pendingUserTurnRef.current = true;

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
					}, TURN_TIMEOUT_MS);

					pendingUserTurnRef.current = false;
					registerTurnHandler(turnId, turnState);
				});
			} catch (error) {
				pendingUserTurnRef.current = false;

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
		backgroundTasks,
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

function createDeferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

function sleep(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
