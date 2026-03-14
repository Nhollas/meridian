import { TOOL_NAMES } from "./view-models";

/**
 * Creates a concise, human-readable summary of what a tool call did.
 * e.g., "$ meridian auth login --json" or "read config.json"
 */
export function formatToolSummary(name: string, input?: string): string {
	const label = TOOL_NAMES[name as keyof typeof TOOL_NAMES] ?? name;
	if (!input) return label;

	try {
		const parsed = JSON.parse(input);
		switch (name) {
			case "run_command":
				return parsed.command ? `$ ${parsed.command.join(" ")}` : label;
			case "read_file":
				return parsed.path ?? label;
			case "write_file":
				return parsed.path ?? label;
			case "list_directory":
				return `ls ${parsed.path ?? "."}`;
			case "inspect_background_command":
				return `inspect ${parsed.commandId ?? "process"}`;
			case "wait_for_background_command":
				return `await ${parsed.commandId ?? "process"}`;
			case "terminate_background_command":
				return `kill ${parsed.commandId ?? "process"}`;
			default:
				return label;
		}
	} catch {
		return label;
	}
}

/**
 * Extracts the meaningful output from a tool call result,
 * showing terminal-style output rather than the raw JSON envelope.
 */
export function formatToolOutput(name: string, result: string): string {
	if (!result) return "";

	try {
		const parsed = JSON.parse(result);
		switch (name) {
			case "run_command": {
				const parts: string[] = [];
				if (parsed.stdout) parts.push(parsed.stdout.trimEnd());
				if (parsed.stderr) parts.push(parsed.stderr.trimEnd());
				if (parsed.exitCode !== undefined && parsed.exitCode !== 0) {
					parts.push(`exit ${parsed.exitCode}`);
				}
				return parts.join("\n") || "(no output)";
			}
			case "write_file":
				return parsed.path ? `Written to ${parsed.path}` : result;
			case "list_directory": {
				if (Array.isArray(parsed)) {
					return parsed
						.map((f: { name?: string; type?: string } | string) => {
							if (typeof f === "string") return f;
							const n = f.name ?? String(f);
							return f.type === "directory" ? `${n}/` : n;
						})
						.join("  ");
				}
				return result;
			}
			default:
				return typeof parsed === "string"
					? parsed
					: JSON.stringify(parsed, null, 2);
		}
	} catch {
		// Not JSON — likely raw text (e.g., read_file returns plain content)
		return result;
	}
}
