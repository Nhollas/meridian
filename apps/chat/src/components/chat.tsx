"use client";

import { useEffect, useState } from "react";
import { useAutoScroll } from "@/lib/chat/use-auto-scroll";
import { useChat } from "@/lib/chat/use-chat";
import { ChatInput } from "./chat-input";
import { ChatMessage } from "./chat-message";
import { DebugToolbar } from "./debug-toolbar";
import type { ToolDisplayMode } from "./tool-display-toggle";

const TOOL_DISPLAY_KEY = "meridian:tool-display-mode";

function useToolDisplayMode() {
	const [mode, setMode] = useState<ToolDisplayMode>("strip");

	useEffect(() => {
		const stored = localStorage.getItem(TOOL_DISPLAY_KEY);
		if (stored === "strip" || stored === "thread" || stored === "classic") {
			setMode(stored);
		}
	}, []);

	function setAndPersist(next: ToolDisplayMode) {
		setMode(next);
		localStorage.setItem(TOOL_DISPLAY_KEY, next);
	}

	return [mode, setAndPersist] as const;
}

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
	const [toolDisplayMode, setToolDisplayMode] = useToolDisplayMode();

	function handleSend(content: string) {
		enableAutoScroll();
		sendMessage(content);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<DebugToolbar
				messages={messages}
				sessionId={sessionId}
				debugStreamDelayMs={debugStreamDelayMs}
				onToggleDebugStreamDelay={toggleDebugStreamDelay}
				toolDisplayMode={toolDisplayMode}
				onToolDisplayModeChange={setToolDisplayMode}
			/>
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
						<ChatMessage
							key={msg.id}
							message={msg}
							toolDisplayMode={toolDisplayMode}
						/>
					))}
				</div>
			</div>

			<ChatInput onSend={handleSend} disabled={isPending} />
		</div>
	);
}
