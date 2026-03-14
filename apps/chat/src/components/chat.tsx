"use client";

import { useState } from "react";
import { useAutoScroll } from "@/lib/chat/use-auto-scroll";
import { useChat } from "@/lib/chat/use-chat";
import { ChatInput } from "./chat-input";
import { ChatMessage } from "./chat-message";
import { DebugToolbar } from "./debug-toolbar";
import { ThemeToggle } from "./theme-toggle";

export function Chat() {
	const {
		messages,
		sendMessage,
		isPending,
		sessionId,
		debugStreamDelayMs,
		toggleDebugStreamDelay,
	} = useChat();
	const { scrollRef, handleScroll, enableAutoScroll } = useAutoScroll(messages);
	const [showDebug, setShowDebug] = useState(false);

	function handleSend(content: string) {
		enableAutoScroll();
		sendMessage(content);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<header className="shrink-0 border-border border-b">
				<div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
					<h1 className="font-display font-semibold text-lg tracking-tight">
						Meridian Chat
					</h1>
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={() => setShowDebug((prev) => !prev)}
							aria-label="Toggle debug tools"
							className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
								showDebug
									? "bg-surface-2 text-text-secondary"
									: "text-text-muted hover:bg-surface-2 hover:text-text-secondary"
							}`}
						>
							<svg
								aria-hidden="true"
								width="16"
								height="16"
								viewBox="0 0 16 16"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M6 2.5a2 2 0 0 1 4 0M5 14.5h6M8 5v9.5" />
								<path d="M3.5 7.5h9M3.5 10.5h9" />
								<path d="M5 5a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0V5Z" />
							</svg>
						</button>
						<ThemeToggle />
					</div>
				</div>
			</header>

			{showDebug && (
				<DebugToolbar
					messages={messages}
					sessionId={sessionId}
					debugStreamDelayMs={debugStreamDelayMs}
					onToggleDebugStreamDelay={toggleDebugStreamDelay}
				/>
			)}

			<div
				ref={scrollRef}
				onScroll={handleScroll}
				className="min-h-0 flex-1 overflow-y-scroll overscroll-contain"
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

					<div className="flex flex-col gap-6">
						{messages.map((msg) => (
							<ChatMessage key={msg.id} message={msg} />
						))}
					</div>
				</div>
			</div>

			<ChatInput onSend={handleSend} disabled={isPending} />
		</div>
	);
}
