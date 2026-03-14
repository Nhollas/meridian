import type { Command } from "commander";
import {
	addJsonOption,
	getActionCommand,
	getJsonMode,
} from "@/command-helpers";
import type { ResolvedCliDependencies } from "@/runtime";
import { handleResultsGet, type ResultsGetOptions } from "./get";

export function registerResultCommands(
	program: Command,
	dependencies: ResolvedCliDependencies,
	setExitCode: (code: number) => void,
) {
	const results = program
		.command("results")
		.description("View comparison results");

	addJsonOption(
		results
			.command("get")
			.description("Get the result for a proposal")
			.requiredOption("--proposal <id>", "Proposal id")
			.action(async (...args: unknown[]) => {
				const command = getActionCommand(args);
				const options = command.opts<ResultsGetOptions>();
				setExitCode(
					await handleResultsGet(
						dependencies,
						options,
						getJsonMode(dependencies.stdout, command),
					),
				);
			}),
	);
}
