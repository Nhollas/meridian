import { type Command, Option } from "commander";
import {
	addJsonOption,
	getActionCommand,
	getJsonMode,
} from "@/command-helpers";
import type { ResolvedCliDependencies } from "@/runtime";
import { handleResultsGet, type ResultsGetOptions } from "./get";
import { sortOrders } from "./presenter";

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
			.addOption(
				new Option("--sort <order>", "Sort order for offerings")
					.choices(sortOrders)
					.default("price-asc"),
			)
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
