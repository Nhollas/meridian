"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import {
	buildDebugTrace,
	type ChatTurnTrace,
	createTurnTrace,
} from "@/lib/chat/debug-trace";
import {
	mapRuntimeToolEventToViewModel,
	mapRuntimeTurnToolCallsToViewModels,
} from "@/lib/chat/runtime-event-mappers";
import type {
	ChatMessageStatus,
	ChatMessageViewModel as ChatMessageType,
	ToolCallViewModel as ToolCallInfo,
} from "@/lib/chat/view-models";
import {
	parseRuntimeEventEnvelope,
	type RuntimeEventEnvelope,
} from "@/lib/runtime-events/contracts";
import { ChatInput } from "./chat-input";
import { ChatMessage } from "./chat-message";

const SESSION_STORAGE_KEY = "meridian.chat.session-id";
const DEBUG_STREAM_DELAY_STORAGE_KEY = "meridian.chat.debug-stream-delay-ms";
const DEBUG_STREAM_DELAY_MS = 120;
const AUTO_SCROLL_THRESHOLD_PX = 96;
const TRACE_BUTTON_CLASS =
	"rounded-md border border-border bg-surface-1 px-3 py-1.5 text-text-secondary text-xs transition-colors hover:border-flow hover:text-text-primary";

function createMessage(
	role: "user" | "assistant",
	content: string,
	options?: {
		status?: ChatMessageStatus;
		toolCalls?: ToolCallInfo[];
	},
): ChatMessageType {
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

export function Chat() {
	const [messages, setMessages] = useState<ChatMessageType[]>([]);
	const [loading, setLoading] = useState(false);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [turnLogs, setTurnLogs] = useState<ChatTurnTrace[]>([]);
	const [traceStatus, setTraceStatus] = useState<string | null>(null);
	const [debugStreamDelayMs, setDebugStreamDelayMs] = useState(0);
	const scrollRef = useRef<HTMLDivElement>(null);
	const shouldAutoScrollRef = useRef(true);
	const latestMessageFingerprint = getMessageFingerprint(messages.at(-1));

	// biome-ignore lint/correctness/useExhaustiveDependencies: auto-scroll should respond to streamed message/tool updates only
	useEffect(() => {
		const scrollElement = scrollRef.current;
		if (!scrollElement || !shouldAutoScrollRef.current) {
			return;
		}

		scrollElement.scrollTop = scrollElement.scrollHeight;
	}, [messages.length, latestMessageFingerprint]);

	useEffect(() => {
		setSessionId(getOrCreateSessionId());
		setDebugStreamDelayMs(getStoredDebugStreamDelayMs());
	}, []);

	useEffect(() => {
		if (!traceStatus) {
			return;
		}

		const timeout = window.setTimeout(() => {
			setTraceStatus(null);
		}, 2500);

		return () => window.clearTimeout(timeout);
	}, [traceStatus]);

	async function handleSend(content: string) {
		const activeSessionId = sessionId ?? getOrCreateSessionId();
		if (activeSessionId !== sessionId) {
			setSessionId(activeSessionId);
		}

		const userMessage = createMessage("user", content);
		const assistantMessage = createMessage("assistant", "", {
			status: "streaming",
			toolCalls: [],
		});
		const conversationMessages = [...messages, userMessage];
		shouldAutoScrollRef.current = true;
		setMessages([...conversationMessages, assistantMessage]);
		setLoading(true);

		const runtimeEvents: RuntimeEventEnvelope[] = [];

		function recordTurn(response: NonNullable<ChatTurnTrace["response"]>) {
			setTurnLogs((prev) => [
				...prev,
				createTurnTrace({
					response,
					runtimeEvents,
					sessionId: activeSessionId,
					userMessageId: userMessage.id,
				}),
			]);
		}

		let streamedContent = "";
		let streamedToolCalls: ToolCallInfo[] = [];
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
			const res = await fetch("/api/chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-meridian-debug-stream-delay-ms": String(debugStreamDelayMs),
				},
				body: JSON.stringify({
					message: content,
					sessionId: activeSessionId,
				}),
			});

			if (!res.ok) {
				throw new Error(`Request failed: ${res.status}`);
			}

			await readChatStream(res, (event) => {
				runtimeEvents.push(event);

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
					recordTurn({
						content: event.payload.content,
						toolCalls: streamedToolCalls,
					});

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

			console.error("Chat API error:", error);
			recordTurn({
				error: error instanceof Error ? error.message : String(error),
			});

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
		} finally {
			setLoading(false);
		}
	}

	async function handleCopyTrace() {
		const trace = buildDebugTrace({
			messages,
			sessionId,
			turnLogs,
		});

		try {
			await navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
			setTraceStatus("Debug trace copied");
		} catch (error) {
			console.error("Trace copy failed:", error);
			setTraceStatus("Trace copy failed");
		}
	}

	function handleDownloadTrace() {
		const trace = buildDebugTrace({
			messages,
			sessionId,
			turnLogs,
		});
		const blob = new Blob([JSON.stringify(trace, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `meridian-chat-trace-${new Date().toISOString()}.json`;
		link.click();
		URL.revokeObjectURL(url);
		setTraceStatus("Debug trace downloaded");
	}

	function handleToggleDebugStreamDelay() {
		const nextDelay = debugStreamDelayMs > 0 ? 0 : DEBUG_STREAM_DELAY_MS;
		setDebugStreamDelayMs(nextDelay);
		window.sessionStorage.setItem(
			DEBUG_STREAM_DELAY_STORAGE_KEY,
			String(nextDelay),
		);
	}

	function handleScroll() {
		const scrollElement = scrollRef.current;
		if (!scrollElement) {
			return;
		}

		shouldAutoScrollRef.current = isNearBottom(scrollElement);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="shrink-0 border-border border-b bg-surface-0/90 backdrop-blur">
				<div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-6 py-2">
					<p className="text-text-muted text-xs">
						Export the current chat trace when something goes wrong.
					</p>
					<div className="flex items-center gap-2">
						{traceStatus && (
							<span className="text-text-muted text-xs">{traceStatus}</span>
						)}
						<button
							type="button"
							onClick={handleToggleDebugStreamDelay}
							className={
								debugStreamDelayMs > 0
									? "rounded-md border border-flow bg-flow-muted px-3 py-1.5 text-flow text-xs transition-colors hover:bg-flow/20"
									: TRACE_BUTTON_CLASS
							}
						>
							Slow Stream
						</button>
						<button
							type="button"
							onClick={handleCopyTrace}
							className={TRACE_BUTTON_CLASS}
						>
							Copy Debug Trace
						</button>
						<button
							type="button"
							onClick={handleDownloadTrace}
							className={TRACE_BUTTON_CLASS}
						>
							Download JSON
						</button>
					</div>
				</div>
			</div>
			<div
				ref={scrollRef}
				onScroll={handleScroll}
				className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
			>
				<div
					role="log"
					aria-label="Conversation"
					aria-live="polite"
					aria-relevant="additions text"
					className="mx-auto max-w-4xl px-6 py-8"
				>
					{messages.length === 0 && (
						<div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-border border-dashed py-16 text-center">
							<h1 className="font-display font-semibold text-lg tracking-tight">
								Meridian Agent
							</h1>
							<p className="mt-2 max-w-md text-sm text-text-secondary">
								I can help you compare broadband, travel insurance, and more.
								Send a message to get started.
							</p>
						</div>
					)}

					{messages.map((msg) => (
						<ChatMessage key={msg.id} message={msg} />
					))}
				</div>
			</div>

			<ChatInput onSend={handleSend} disabled={loading} />
		</div>
	);
}

function getStoredDebugStreamDelayMs() {
	const raw = window.sessionStorage.getItem(DEBUG_STREAM_DELAY_STORAGE_KEY);
	if (!raw) {
		return 0;
	}

	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function isNearBottom(element: HTMLDivElement) {
	return (
		element.scrollHeight - element.scrollTop - element.clientHeight <=
		AUTO_SCROLL_THRESHOLD_PX
	);
}

function getMessageFingerprint(message?: ChatMessageType) {
	if (!message) {
		return "";
	}

	const toolCallFingerprint =
		message.toolCalls
			?.map(
				(toolCall) =>
					`${toolCall.id}:${toolCall.status ?? ""}:${toolCall.input?.length ?? 0}:${toolCall.result.length}`,
			)
			.join("|") ?? "";

	return `${message.id}:${message.status ?? ""}:${message.content.length}:${toolCallFingerprint}`;
}

function updateAssistantMessage(
	messages: ChatMessageType[],
	messageId: string,
	patch: Partial<ChatMessageType>,
) {
	return messages.map((message) =>
		message.id === messageId ? { ...message, ...patch } : message,
	);
}

function upsertToolCall(toolCalls: ToolCallInfo[], nextToolCall: ToolCallInfo) {
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

async function readChatStream(
	response: Response,
	onEvent: (event: RuntimeEventEnvelope) => void,
) {
	const reader = response.body?.getReader();
	if (!reader) {
		throw new Error("Streaming response body missing.");
	}

	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		buffer += decoder.decode(value, { stream: !done });

		let offset = 0;
		let newlineIndex = buffer.indexOf("\n", offset);
		while (newlineIndex >= 0) {
			const line = buffer.slice(offset, newlineIndex).trim();
			offset = newlineIndex + 1;

			if (line) {
				onEvent(parseRuntimeEventEnvelope(JSON.parse(line)));
			}

			newlineIndex = buffer.indexOf("\n", offset);
		}

		buffer = buffer.slice(offset);

		if (done) {
			const remaining = buffer.trim();
			if (remaining) {
				onEvent(parseRuntimeEventEnvelope(JSON.parse(remaining)));
			}
			return;
		}
	}
}
