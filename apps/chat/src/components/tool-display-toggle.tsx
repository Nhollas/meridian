"use client";

export type ToolDisplayMode = "strip" | "thread" | "classic";

const MODES: { value: ToolDisplayMode; label: string }[] = [
	{ value: "strip", label: "Strip" },
	{ value: "thread", label: "Thread" },
	{ value: "classic", label: "Classic" },
];

interface ToolDisplayToggleProps {
	value: ToolDisplayMode;
	onChange: (mode: ToolDisplayMode) => void;
}

export function ToolDisplayToggle({ value, onChange }: ToolDisplayToggleProps) {
	return (
		<div className="flex items-center gap-1 rounded-lg border border-border-subtle bg-surface-1/50 p-0.5">
			{MODES.map((mode) => (
				<button
					key={mode.value}
					type="button"
					onClick={() => onChange(mode.value)}
					className={`rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-all duration-150 ${
						value === mode.value
							? "bg-surface-2 text-text-primary shadow-sm"
							: "text-text-muted hover:text-text-secondary"
					}`}
				>
					{mode.label}
				</button>
			))}
		</div>
	);
}
