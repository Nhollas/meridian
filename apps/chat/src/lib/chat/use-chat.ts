import { useMutation } from "@tanstack/react-query";
import { startTransition, useEffect, useState } from "react";
import type { ToolCallViewModel } from "./contracts";
import {
	mapRuntimeToolEventToViewModel,
	mapRuntimeTurnToolCallsToViewModels,
} from "./runtime-event-mappers";
import { readChatStream } from "./stream-reader";
import type { ChatMessageStatus, ChatMessageViewModel } from "./view-models";

const API_URL =
	typeof process !== "undefined"
		? (process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3201")
		: "http://localhost:3201";

const SESSION_STORAGE_KEY = "meridian.chat.session-id";
const DEBUG_STREAM_DELAY_STORAGE_KEY = "meridian.chat.debug-stream-delay-ms";
const DEBUG_STREAM_DELAY_MS = 120;

export function useChat() {
	const [messages, setMessages] = useState<ChatMessageViewModel[]>([]);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [debugStreamDelayMs, setDebugStreamDelayMs] = useState(0);

	useEffect(() => {
		setSessionId(getOrCreateSessionId());
		setDebugStreamDelayMs(getStoredDebugStreamDelayMs());
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

			let streamedContent = "";
			let streamedToolCalls: ToolCallViewModel[] = [];
			let streamFinished = false;
			let frameId: number | null = null;

			const flushAssistantState = (status: ChatMessageStatus = "streaming") => {
				frameId = null;
				const contentSnapshot = streamedContent;
				const toolCallsSnapshot = streamedToolCalls;

				startTransition(() => {
					setMessages((prev) =>
						updateAssistantMessage(prev, assistantMessage.id, {
							content: contentSnapshot,
							toolCalls: toolCallsSnapshot,
							status,
						}),
					);
				});
			};

			const scheduleFlush = () => {
				if (frameId !== null) {
					return;
				}

				frameId = window.requestAnimationFrame(() => {
					flushAssistantState();
				});
			};

			try {
				const res = await fetch(`${API_URL}/api/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"session-id": activeSessionId,
						"meridian-debug-stream-delay-ms": String(debugStreamDelayMs),
					},
					body: JSON.stringify({ message: content }),
				});

				if (!res.ok) {
					throw new Error(`Request failed: ${res.status}`);
				}

				await readChatStream(res, (event) => {
					if (event.type === "assistant.delta") {
						streamedContent += event.payload.delta;
						scheduleFlush();
						return;
					}

					if (
						event.type === "tool.started" ||
						event.type === "tool.completed" ||
						event.type === "tool.failed"
					) {
						streamedToolCalls = upsertToolCall(
							streamedToolCalls,
							mapRuntimeToolEventToViewModel(event),
						);
						scheduleFlush();
						return;
					}

					if (event.type === "turn.completed") {
						streamFinished = true;
						streamedContent = event.payload.content;
						streamedToolCalls = mapRuntimeTurnToolCallsToViewModels(
							event.payload.toolCalls,
						);

						if (frameId !== null) {
							window.cancelAnimationFrame(frameId);
						}

						flushAssistantState("complete");
						return;
					}

					throw new Error(event.payload.error);
				});

				if (!streamFinished) {
					throw new Error("Stream ended before completion.");
				}
			} catch (error) {
				if (frameId !== null) {
					window.cancelAnimationFrame(frameId);
				}

				startTransition(() => {
					setMessages((prev) =>
						updateAssistantMessage(prev, assistantMessage.id, {
							content:
								streamedContent ||
								"Something went wrong reaching the agent. Check the console for details.",
							toolCalls: streamedToolCalls,
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

	function toggleDebugStreamDelay() {
		const nextDelay = debugStreamDelayMs > 0 ? 0 : DEBUG_STREAM_DELAY_MS;
		setDebugStreamDelayMs(nextDelay);
		window.sessionStorage.setItem(
			DEBUG_STREAM_DELAY_STORAGE_KEY,
			String(nextDelay),
		);
	}

	return {
		messages,
		sessionId,
		isPending,
		isError,
		debugStreamDelayMs,
		sendMessage,
		toggleDebugStreamDelay,
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

function getStoredDebugStreamDelayMs() {
	const raw = window.sessionStorage.getItem(DEBUG_STREAM_DELAY_STORAGE_KEY);
	if (!raw) {
		return 0;
	}

	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
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
