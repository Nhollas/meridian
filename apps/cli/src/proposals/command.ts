import type { Command } from "commander";
import {
	addJsonOption,
	getActionCommand,
	getJsonMode,
} from "@/command-helpers";
import type { ResolvedCliDependencies } from "@/runtime";
import { handleProposalsCreate, type ProposalCreateOptions } from "./create";

export function registerProposalCommands(
	program: Command,
	dependencies: ResolvedCliDependencies,
	setExitCode: (code: number) => void,
) {
	const proposals = program
		.command("proposals")
		.description("Manage proposals (comparisons)");

	addJsonOption(
		proposals
			.command("create")
			.description("Create a proposal from a proposal request")
			.requiredOption("--proposal-request <id>", "Proposal request id")
			.action(async (...args: unknown[]) => {
				const command = getActionCommand(args);
				const options = command.opts<ProposalCreateOptions>();
				setExitCode(
					await handleProposalsCreate(
						dependencies,
						options,
						getJsonMode(dependencies.stdout, command),
					),
				);
			}),
	);
}
