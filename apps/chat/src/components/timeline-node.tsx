interface TimelineNodeProps {
	dot: "flow" | "accent";
	badge: React.ReactNode;
	meta: React.ReactNode;
	children?: React.ReactNode;
}

const dotStyles = {
	flow: "bg-flow",
	accent: "bg-accent",
} as const;

export function TimelineNode({
	dot,
	badge,
	meta,
	children,
}: TimelineNodeProps) {
	return (
		<div className="group relative flex gap-4 pb-6 last:pb-0">
			<div className="relative flex flex-col items-center">
				<div
					className={`z-10 mt-1.25 h-3 w-3 shrink-0 rounded-full ring-4 ring-surface-0 ${dotStyles[dot]}`}
				/>
				<div className="w-px grow bg-border-subtle group-last:hidden" />
			</div>

			<div className="min-w-0 flex-1 pb-2">
				<div className="flex flex-wrap items-center gap-2">
					{badge}
					{meta}
				</div>
				{children}
			</div>
		</div>
	);
}
