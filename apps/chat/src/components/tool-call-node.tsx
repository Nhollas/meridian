"use client";

import { useMemo } from "react";
import {
	TOOL_NAMES,
	type ToolCallViewModel as ToolCallInfo,
} from "@/lib/chat/view-models";

const TOOL_STATUS_STYLES = {
	completed: "border-success/20 bg-success-muted text-success",
	error: "border-error/20 bg-error-muted text-error",
	running: "border-warning/20 bg-warning-muted text-warning",
} as const;

const TOOL_STATUS_LABELS = {
	completed: "Complete",
	error: "Failed",
	running: "Running",
} as const;

function ToolSection({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="overflow-hidden rounded-lg border border-border-subtle bg-surface-1">
			<div className="border-border-subtle border-b px-3 py-2 font-medium text-[11px] text-text-muted uppercase tracking-[0.12em]">
				{label}
			</div>
			<pre className="max-h-60 overflow-auto p-3 font-mono text-text-secondary text-xs leading-relaxed">
				{children}
			</pre>
		</div>
	);
}

function tryFormatJson(raw: string): string {
	try {
		return JSON.stringify(JSON.parse(raw), null, 2);
	} catch {
		return raw;
	}
}

interface ToolCallNodeProps {
	toolCall: ToolCallInfo;
}

export function ToolCallNode({ toolCall }: ToolCallNodeProps) {
	const label =
		TOOL_NAMES[toolCall.name as keyof typeof TOOL_NAMES] ?? toolCall.name;
	const status = toolCall.status ?? "completed";
	const isExpandable = status !== "running";

	const formattedInput = useMemo(
		() => (toolCall.input ? tryFormatJson(toolCall.input) : ""),
		[toolCall.input],
	);

	const formattedResult = useMemo(
		() => tryFormatJson(toolCall.result),
		[toolCall.result],
	);

	if (!isExpandable) {
		return (
			<fieldset
				aria-label={`Tool call ${label}`}
				className="m-0 min-w-0 border-0 p-0"
			>
				<div className="rounded-xl border border-border-subtle bg-surface-1/70 px-3 py-2.5">
					<div className="flex flex-wrap items-center gap-1.5 text-text-muted text-xs">
						<span className="tool-badge">{label}</span>
						<span
							className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-[10px] uppercase tracking-[0.16em] ${TOOL_STATUS_STYLES[status]}`}
						>
							<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
							{TOOL_STATUS_LABELS[status]}
						</span>
						<span className="ml-auto text-[11px] text-text-muted/70 uppercase tracking-[0.16em]">
							Details available on completion
						</span>
					</div>
				</div>
			</fieldset>
		);
	}

	return (
		<fieldset
			aria-label={`Tool call ${label}`}
			className="m-0 min-w-0 border-0 p-0"
		>
			<details className="group/tool">
				<summary className="flex cursor-pointer list-none flex-wrap items-center gap-1.5 text-text-muted text-xs transition-colors hover:text-text-secondary [&::-webkit-details-marker]:hidden">
					<svg
						aria-hidden="true"
						width="10"
						height="10"
						viewBox="0 0 10 10"
						fill="none"
						className="shrink-0 transition-transform group-open/tool:rotate-90"
					>
						<path
							d="M3 1.5l3.5 3.5L3 8.5"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
					<span className="tool-badge">{label}</span>
					<span
						className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-[10px] uppercase tracking-[0.16em] ${TOOL_STATUS_STYLES[status]}`}
					>
						{TOOL_STATUS_LABELS[status]}
					</span>
				</summary>
				<div className="mt-2 flex flex-col gap-2">
					{toolCall.input && (
						<ToolSection label="Arguments">{formattedInput}</ToolSection>
					)}
					<ToolSection label="Result">
						{formattedResult || "Awaiting tool output..."}
					</ToolSection>
				</div>
			</details>
		</fieldset>
	);
}
