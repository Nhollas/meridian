"use client";

import { useEffect, useState } from "react";
import { buildCopyDebugTrace } from "@/lib/chat/debug-trace";
import type { ChatMessageViewModel } from "@/lib/chat/view-models";
import { type ToolDisplayMode, ToolDisplayToggle } from "./tool-display-toggle";

const TRACE_BUTTON_CLASS =
	"rounded-md border border-border bg-surface-1 px-3 py-1.5 text-text-secondary text-xs transition-colors hover:border-flow hover:text-text-primary";

interface DebugToolbarProps {
	messages: ChatMessageViewModel[];
	sessionId: string | null;
	debugStreamDelayMs: number;
	onToggleDebugStreamDelay: () => void;
	toolDisplayMode: ToolDisplayMode;
	onToolDisplayModeChange: (mode: ToolDisplayMode) => void;
}

export function DebugToolbar({
	messages,
	sessionId,
	debugStreamDelayMs,
	onToggleDebugStreamDelay,
	toolDisplayMode,
	onToolDisplayModeChange,
}: DebugToolbarProps) {
	const [traceStatus, setTraceStatus] = useState<string | null>(null);

	useEffect(() => {
		if (!traceStatus) {
			return;
		}

		const timeout = window.setTimeout(() => {
			setTraceStatus(null);
		}, 2500);

		return () => window.clearTimeout(timeout);
	}, [traceStatus]);

	async function handleCopyTrace() {
		const trace = buildCopyDebugTrace({ messages, sessionId });

		try {
			await navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
			setTraceStatus("Debug trace copied");
		} catch (error) {
			console.error("Trace copy failed:", error);
			setTraceStatus("Trace copy failed");
		}
	}

	function handleDownloadTrace() {
		const trace = buildCopyDebugTrace({ messages, sessionId });
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

	return (
		<div className="shrink-0 border-border border-b bg-surface-0/90 backdrop-blur">
			<div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-6 py-2">
				<div className="flex items-center gap-3">
					<p className="text-text-muted text-xs">Tool display</p>
					<ToolDisplayToggle
						value={toolDisplayMode}
						onChange={onToolDisplayModeChange}
					/>
				</div>
				<div className="flex items-center gap-2">
					{traceStatus && (
						<span className="text-text-muted text-xs">{traceStatus}</span>
					)}
					<button
						type="button"
						onClick={onToggleDebugStreamDelay}
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
	);
}
