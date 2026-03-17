export function StatusDot({
	status,
}: {
	status: "running" | "error" | "completed";
}) {
	const label =
		status === "running"
			? "Running"
			: status === "error"
				? "Error"
				: "Completed";
	const color =
		status === "running"
			? "animate-pulse bg-warning"
			: status === "error"
				? "bg-error"
				: "bg-success";
	return (
		<span
			role="img"
			aria-label={label}
			className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`}
		/>
	);
}
