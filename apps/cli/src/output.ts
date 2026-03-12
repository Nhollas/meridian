import type { Writable } from "./runtime";

export type OutputMode = "json" | "human";

export function getOutputMode(
	stdout: Writable,
	jsonRequested: boolean,
): OutputMode {
	if (jsonRequested || !stdout.isTTY) {
		return "json";
	}

	return "human";
}

export function writeJson(stdout: Writable, payload: unknown) {
	stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export function writeJsonLine(stdout: Writable, payload: unknown) {
	stdout.write(`${JSON.stringify(payload)}\n`);
}

export function writeLines(stdout: Writable, lines: string[]) {
	stdout.write(`${lines.join("\n")}\n`);
}
