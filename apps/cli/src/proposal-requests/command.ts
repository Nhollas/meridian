import type { Command } from "commander";
import {
	addJsonOption,
	getActionCommand,
	getJsonMode,
} from "@/cli/command-helpers";
import type { ResolvedCliDependencies } from "@/runtime";
import {
	handleProposalRequestsCreate,
	type ProposalRequestCreateOptions,
} from "./create";

export function registerProposalRequestCommands(
	program: Command,
	dependencies: ResolvedCliDependencies,
	setExitCode: (code: number) => void,
) {
	const proposalRequests = program
		.command("proposal-requests")
		.description("Manage proposal requests (drafts)");

	addJsonOption(
		proposalRequests
			.command("create")
			.description("Create a new proposal request from a JSON file")
			.requiredOption("--product <product>", "Product name")
			.requiredOption("--version <version>", "Schema version")
			.requiredOption("--file <path>", "Path to input JSON")
			.action(async (...args: unknown[]) => {
				const command = getActionCommand(args);
				const options = command.opts<ProposalRequestCreateOptions>();
				setExitCode(
					await handleProposalRequestsCreate(
						dependencies,
						options,
						getJsonMode(dependencies.stdout, command),
					),
				);
			}),
	);
}
