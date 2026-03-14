"use client";

import { useEffect, useState } from "react";
import { buildCopyDebugTrace } from "@/lib/debug-trace";
import type { ChatMessageViewModel } from "@/lib/view-models";

function safeJsonStringify(value: unknown): string {
	return JSON.stringify(value, null, 2)
		.replaceAll("\u2028", "\\u2028")
		.replaceAll("\u2029", "\\u2029");
}

const TRACE_BUTTON_CLASS =
	"rounded-md border border-border bg-surface-1 px-3 py-1.5 text-text-secondary text-xs transition-colors hover:border-flow hover:text-text-primary";

interface DebugToolbarProps {
	messages: ChatMessageViewModel[];
	sessionId: string | null;
	debugStreamDelayMs: number;
	onToggleDebugStreamDelay: () => void;
}

export function DebugToolbar({
	messages,
	sessionId,
	debugStreamDelayMs,
	onToggleDebugStreamDelay,
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
			await navigator.clipboard.writeText(safeJsonStringify(trace));
			setTraceStatus("Debug trace copied");
		} catch (error) {
			console.error("Trace copy failed:", error);
			setTraceStatus("Trace copy failed");
		}
	}

	function handleDownloadTrace() {
		const trace = buildCopyDebugTrace({ messages, sessionId });
		const blob = new Blob([safeJsonStringify(trace)], {
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
				<p className="text-text-muted text-xs">
					Export the current chat trace when something goes wrong.
				</p>
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
