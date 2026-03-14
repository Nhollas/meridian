"use client";

import type { ChatMessageViewModel as ChatMessageType } from "@/lib/view-models";
import { Markdown } from "./markdown";
import { ProgressThread } from "./progress-thread";

interface ChatMessageProps {
	message: ChatMessageType;
}

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
});

function formatTime(iso: string) {
	return timeFormatter.format(new Date(iso));
}

const EMPTY_TOOL_CALLS: NonNullable<ChatMessageType["toolCalls"]> = [];

function UserMessage({ message }: { message: ChatMessageType }) {
	return (
		<article aria-label="User message" className="flex justify-end">
			<div className="max-w-[80%]">
				<div className="rounded-2xl rounded-br-md bg-accent-muted px-4 py-2.5">
					<p className="whitespace-pre-wrap text-sm text-text-primary leading-relaxed">
						{message.content}
					</p>
				</div>
				<span className="mt-1 block text-right font-mono text-[10px] text-text-muted/60">
					{formatTime(message.timestamp)}
				</span>
			</div>
		</article>
	);
}

function AssistantMessage({ message }: { message: ChatMessageType }) {
	const isStreaming = message.status === "streaming";
	const isError = message.status === "error";
	const visibleToolCalls = message.toolCalls ?? EMPTY_TOOL_CALLS;

	return (
		<article aria-label="Assistant message" className="max-w-full">
			<div className="flex items-center gap-2">
				<span className="font-medium text-[11px] text-text-muted uppercase tracking-[0.12em]">
					Meridian
				</span>
				<span className="font-mono text-[10px] text-text-muted/60">
					{formatTime(message.timestamp)}
				</span>
				{isStreaming && (
					<span className="inline-flex items-center gap-1 font-medium text-[10px] text-flow uppercase tracking-[0.12em]">
						<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-flow" />
						Streaming
					</span>
				)}
				{isError && (
					<span className="font-medium text-[10px] text-error uppercase tracking-[0.12em]">
						Interrupted
					</span>
				)}
			</div>

			{visibleToolCalls.length > 0 && (
				<ProgressThread toolCalls={visibleToolCalls} />
			)}

			{message.content && (
				<div className="mt-2 text-sm text-text-secondary leading-relaxed">
					<Markdown content={message.content} />
				</div>
			)}
		</article>
	);
}

export function ChatMessage({ message }: ChatMessageProps) {
	if (message.role === "user") {
		return <UserMessage message={message} />;
	}
	return <AssistantMessage message={message} />;
}
