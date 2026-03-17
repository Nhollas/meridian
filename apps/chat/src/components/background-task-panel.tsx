"use client";

import { useEffect, useState } from "react";
import type { BackgroundTaskViewModel } from "@/lib/view-models";
import { StatusDot } from "./status-dot";

function ElapsedDuration({
	startedAt,
	endedAt,
}: {
	startedAt: string;
	endedAt?: string;
}) {
	const [now, setNow] = useState(Date.now);

	useEffect(() => {
		if (endedAt) return;
		const interval = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(interval);
	}, [endedAt]);

	const start = new Date(startedAt).getTime();
	const end = endedAt ? new Date(endedAt).getTime() : now;
	const seconds = Math.max(0, Math.floor((end - start) / 1000));

	return <span className="text-text-muted/50 tabular-nums">{seconds}s</span>;
}

function TaskEntry({ task }: { task: BackgroundTaskViewModel }) {
	return (
		<li
			className="tool-thread-line flex items-center gap-2"
			aria-label={task.label}
		>
			<StatusDot
				status={
					task.status === "running"
						? "running"
						: task.status === "completed"
							? "completed"
							: "error"
				}
			/>
			<span className="min-w-0 flex-1 truncate">{task.label}</span>
			<ElapsedDuration
				startedAt={task.startedAt}
				{...(task.endedAt ? { endedAt: task.endedAt } : {})}
			/>
		</li>
	);
}

interface BackgroundTaskPanelProps {
	tasks: BackgroundTaskViewModel[];
}

export function BackgroundTaskPanel({ tasks }: BackgroundTaskPanelProps) {
	return (
		<aside
			className="fixed right-6 bottom-20 z-10 w-72"
			aria-label="Background tasks"
		>
			<div className="rounded-lg border border-border/50 bg-surface-1/80 px-3 py-2 backdrop-blur-sm">
				{tasks.length === 0 ? (
					<p className="font-mono text-[11px] text-text-muted/50">
						No active tasks
					</p>
				) : (
					<ul className="flex list-none flex-col gap-1.5 font-mono text-[11px] text-text-muted">
						{tasks.map((task) => (
							<TaskEntry key={task.id} task={task} />
						))}
					</ul>
				)}
			</div>
		</aside>
	);
}
