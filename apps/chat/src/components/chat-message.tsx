"use client";

import type { ChatMessageViewModel as ChatMessageType } from "@/lib/chat/view-models";
import { ActivityStrip } from "./activity-strip";
import { Markdown } from "./markdown";
import { ProgressThread } from "./progress-thread";
import { TimelineNode } from "./timeline-node";
import { ToolCallNode } from "./tool-call-node";
import type { ToolDisplayMode } from "./tool-display-toggle";

interface ChatMessageProps {
	message: ChatMessageType;
	toolDisplayMode: ToolDisplayMode;
}

function formatTime(iso: string) {
	const d = new Date(iso);
	return d.toLocaleString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

function ToolCallsDisplay({
	message,
	mode,
}: {
	message: ChatMessageType;
	mode: ToolDisplayMode;
}) {
	const toolCalls = message.toolCalls ?? [];
	if (toolCalls.length === 0) return null;

	switch (mode) {
		case "strip":
			return <ActivityStrip toolCalls={toolCalls} />;
		case "thread":
			return <ProgressThread toolCalls={toolCalls} />;
		case "classic":
			return (
				<div className="mt-3 flex flex-col gap-2">
					{toolCalls.map((tc) => (
						<ToolCallNode key={tc.id} toolCall={tc} />
					))}
				</div>
			);
	}
}

export function ChatMessage({ message, toolDisplayMode }: ChatMessageProps) {
	const isUser = message.role === "user";
	const isStreaming = message.status === "streaming";
	const isError = message.status === "error";
	const messageLabel = isUser ? "User message" : "Assistant message";

	return (
		<article aria-label={messageLabel}>
			<TimelineNode
				dot={isUser ? "accent" : "flow"}
				badge={
					<span
						className={`inline-block rounded-full border px-2.5 py-0.5 font-medium text-xs ${
							isUser
								? "border-accent/20 bg-accent-muted text-accent"
								: "border-flow/20 bg-flow-muted text-flow"
						}`}
					>
						{isUser ? "You" : isStreaming ? "Meridian Live" : "Meridian Agent"}
					</span>
				}
				meta={
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-mono text-text-muted text-xs">
							{formatTime(message.timestamp)}
						</span>
						{!isUser && isStreaming && (
							<span className="inline-flex items-center gap-1 rounded-full border border-flow/25 bg-flow-muted px-2 py-0.5 font-medium text-[10px] text-flow uppercase tracking-[0.16em]">
								<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-flow" />
								Streaming
							</span>
						)}
						{!isUser && isError && (
							<span className="inline-flex rounded-full border border-error/20 bg-error-muted px-2 py-0.5 font-medium text-[10px] text-error uppercase tracking-[0.16em]">
								Interrupted
							</span>
						)}
					</div>
				}
			>
				<ToolCallsDisplay message={message} mode={toolDisplayMode} />

				{message.content && (
					<div className="mt-1.5 text-sm text-text-secondary leading-relaxed">
						{isUser ? (
							<p className="whitespace-pre-wrap">{message.content}</p>
						) : (
							<Markdown content={message.content} />
						)}
					</div>
				)}

				{!isUser && !message.content && isStreaming && (
					<div className="mt-2 inline-flex items-center gap-2 text-text-muted text-xs">
						<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-flow" />
						Opening live response stream
					</div>
				)}

				{!isUser && isStreaming && message.content && (
					<div className="mt-2 inline-flex items-center gap-2 text-[11px] text-text-muted uppercase tracking-[0.16em]">
						<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-flow" />
						Response in progress
					</div>
				)}
			</TimelineNode>
		</article>
	);
}
