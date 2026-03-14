"use client";

import { useMemo, useState } from "react";
import {
	formatActivitySummary,
	formatToolOutput,
	formatToolSummary,
} from "@/lib/chat/tool-formatting";
import type { ToolCallViewModel } from "@/lib/chat/view-models";

interface ProgressThreadProps {
	toolCalls: ToolCallViewModel[];
}

export function ProgressThread({ toolCalls }: ProgressThreadProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const isRunning = toolCalls.some((tc) => tc.status === "running");
	const hasError = toolCalls.some((tc) => tc.status === "error");
	const summary = useMemo(() => formatActivitySummary(toolCalls), [toolCalls]);

	return (
		<div className="mt-3">
			{/* Collapsed summary line */}
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className="group/summary flex w-full items-center gap-2 py-1 text-left"
			>
				<span
					className="w-3 shrink-0 select-none font-mono text-[11px] text-border leading-none"
					aria-hidden="true"
				>
					{isExpanded ? "┬" : "─"}
				</span>

				<span
					className={`h-1.5 w-1.5 shrink-0 rounded-full ${
						isRunning
							? "animate-pulse bg-warning"
							: hasError
								? "bg-error"
								: "bg-success"
					}`}
				/>

				<span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-muted transition-colors group-hover/summary:text-text-secondary">
					{isRunning ? "Working..." : summary}
				</span>
			</button>

			{/* Expanded thread */}
			<div
				className="grid transition-[grid-template-rows] duration-200 ease-out"
				style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
			>
				<div className="overflow-hidden">
					<ul className="flex list-none flex-col" aria-label="Tool calls">
						{toolCalls.map((tc, i) => (
							<ThreadLine
								key={tc.id}
								toolCall={tc}
								isLast={i === toolCalls.length - 1}
							/>
						))}
					</ul>
				</div>
			</div>
		</div>
	);
}

function ThreadLine({
	toolCall,
	isLast,
}: {
	toolCall: ToolCallViewModel;
	isLast: boolean;
}) {
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
		<li className="tool-thread-line">
			<button
				type="button"
				onClick={() => hasOutput && setShowOutput(!showOutput)}
				disabled={isRunning || !hasOutput}
				className="group/line flex w-full items-center gap-2 py-1 text-left transition-colors disabled:cursor-default"
			>
				{/* Tree connector */}
				<span
					className="w-3 shrink-0 select-none font-mono text-[11px] text-border leading-none"
					aria-hidden="true"
				>
					{isLast ? "└" : "├"}
				</span>

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

				{/* Summary text */}
				<span
					className={`min-w-0 flex-1 truncate font-mono text-[11px] transition-colors ${
						isRunning
							? "text-text-muted"
							: "text-text-muted group-hover/line:text-text-secondary"
					}`}
				>
					{summary}
				</span>

				{/* Expand hint — visible on hover */}
				{hasOutput && (
					<span
						className={`text-[10px] transition-opacity ${
							showOutput
								? "text-text-muted/50 opacity-100"
								: "text-text-muted/50 opacity-0 group-hover/line:opacity-100"
						}`}
						aria-hidden="true"
					>
						{showOutput ? "▾" : "▸"}
					</span>
				)}
			</button>

			{/* Output panel */}
			<div
				className="grid transition-[grid-template-rows] duration-150 ease-out"
				style={{
					gridTemplateRows: showOutput && hasOutput ? "1fr" : "0fr",
					marginLeft: "20px",
				}}
			>
				<div className="overflow-hidden">
					<pre className="mb-1 max-h-32 overflow-auto rounded-lg bg-surface-1/50 p-2.5 font-mono text-[11px] text-text-muted leading-relaxed">
						{output}
					</pre>
				</div>
			</div>
		</li>
	);
}
