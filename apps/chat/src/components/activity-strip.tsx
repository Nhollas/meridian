"use client";

import { Fragment, useMemo, useState } from "react";
import {
	formatToolOutput,
	formatToolSummary,
} from "@/lib/chat/tool-formatting";
import type { ToolCallViewModel } from "@/lib/chat/view-models";
import { TOOL_NAMES } from "@/lib/chat/view-models";

interface ActivityStripProps {
	toolCalls: ToolCallViewModel[];
}

export function ActivityStrip({ toolCalls }: ActivityStripProps) {
	const [isOpen, setIsOpen] = useState(false);
	const runningCount = toolCalls.filter((tc) => tc.status === "running").length;
	const isRunning = runningCount > 0;

	return (
		<div className="mt-3">
			{/* Summary bar */}
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex w-full items-center gap-2.5 rounded-xl border border-border-subtle bg-surface-1/40 px-3.5 py-2.5 text-left transition-all duration-150 hover:border-border hover:bg-surface-1/70"
			>
				{/* Chevron */}
				<svg
					aria-hidden="true"
					width="10"
					height="10"
					viewBox="0 0 10 10"
					fill="none"
					className={`shrink-0 text-text-muted transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
				>
					<path
						d="M3 1.5l3.5 3.5L3 8.5"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>

				{/* Tool names flowing horizontally */}
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
					{toolCalls.map((tc, i) => (
						<Fragment key={tc.id}>
							{i > 0 && (
								<span
									className="select-none text-[10px] text-border"
									aria-hidden="true"
								>
									→
								</span>
							)}
							<span
								className={`font-mono text-[11px] leading-none ${
									tc.status === "running"
										? "text-warning"
										: tc.status === "error"
											? "text-error"
											: "text-text-muted"
								}`}
							>
								{tc.status === "running" && (
									<span className="mr-1 inline-block h-1 w-1 animate-pulse rounded-full bg-warning align-middle" />
								)}
								{TOOL_NAMES[tc.name as keyof typeof TOOL_NAMES] ?? tc.name}
							</span>
						</Fragment>
					))}
				</div>

				{/* Count / progress */}
				<span className="shrink-0 font-mono text-[10px] text-text-muted/50 tabular-nums">
					{isRunning
						? `${toolCalls.length - runningCount}/${toolCalls.length}`
						: `${toolCalls.length} tool${toolCalls.length !== 1 ? "s" : ""}`}
				</span>
			</button>

			{/* Expanded panel — uses CSS grid for smooth height animation */}
			<div
				className="grid transition-[grid-template-rows] duration-200 ease-out"
				style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
			>
				<div className="overflow-hidden">
					<div className="pt-2">
						<div className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-surface-1/30">
							{toolCalls.map((tc) => (
								<StripToolRow key={tc.id} toolCall={tc} />
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function StripToolRow({ toolCall }: { toolCall: ToolCallViewModel }) {
	const [showOutput, setShowOutput] = useState(false);
	const summary = formatToolSummary(toolCall.name, toolCall.input);
	const isRunning = toolCall.status === "running";
	const isError = toolCall.status === "error";

	const output = useMemo(
		() => (!isRunning ? formatToolOutput(toolCall.name, toolCall.result) : ""),
		[isRunning, toolCall.name, toolCall.result],
	);

	const hasOutput = output.length > 0;

	return (
		<div className="px-3 py-2">
			<button
				type="button"
				onClick={() => hasOutput && setShowOutput(!showOutput)}
				disabled={isRunning || !hasOutput}
				className="flex w-full items-center gap-2 text-left text-xs disabled:cursor-default"
			>
				{/* Status dot */}
				<span
					className={`h-1.5 w-1.5 shrink-0 rounded-full ${
						isRunning
							? "animate-pulse bg-warning"
							: isError
								? "bg-error"
								: "bg-success"
					}`}
				/>

				{/* Tool summary */}
				<span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-secondary">
					{summary}
				</span>

				{/* Expand chevron */}
				{hasOutput && (
					<svg
						aria-hidden="true"
						width="8"
						height="8"
						viewBox="0 0 10 10"
						fill="none"
						className={`shrink-0 text-text-muted/40 transition-transform duration-150 ${showOutput ? "rotate-90" : ""}`}
					>
						<path
							d="M3 1.5l3.5 3.5L3 8.5"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				)}
			</button>

			{/* Output panel */}
			<div
				className="grid transition-[grid-template-rows] duration-150 ease-out"
				style={{ gridTemplateRows: showOutput && hasOutput ? "1fr" : "0fr" }}
			>
				<div className="overflow-hidden">
					<pre className="mt-1.5 max-h-32 overflow-auto rounded-lg bg-surface-0 p-2.5 font-mono text-[11px] text-text-muted leading-relaxed">
						{output}
					</pre>
				</div>
			</div>
		</div>
	);
}
