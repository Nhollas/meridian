import { Command } from "commander";
import { getOutputMode, writeJson } from "../output.js";
import type { Writable } from "../runtime.js";

export type JsonOption = {
	json?: boolean;
};

export function addJsonOption(command: Command) {
	return command.option(
		"--json",
		"Output as JSON (default when stdout is not a TTY)",
	);
}

export function getActionCommand(args: unknown[]) {
	const command = args.at(-1);
	if (!(command instanceof Command)) {
		throw new Error("Command action did not receive a Commander command.");
	}
	return command;
}

export function getJsonMode(stdout: Writable, command: Command) {
	const options = command.optsWithGlobals() as JsonOption;
	return getOutputMode(stdout, options.json === true) === "json";
}

export function writeError(
	stderr: Writable,
	jsonMode: boolean,
	message: string,
	details?: Record<string, unknown>,
) {
	if (jsonMode) {
		writeJson(stderr, { error: message, ...details });
		return;
	}

	stderr.write(`Error: ${message}\n`);
}
