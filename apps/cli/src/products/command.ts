import type { Command } from "commander";
import {
	addJsonOption,
	getActionCommand,
	getJsonMode,
} from "@/cli/command-helpers";
import type { ResolvedCliDependencies } from "@/runtime";
import { handleProductsList } from "./list";

export function registerProductsCommands(
	program: Command,
	dependencies: ResolvedCliDependencies,
	setExitCode: (code: number) => void,
) {
	const products = program
		.command("products")
		.description("Available product verticals");

	addJsonOption(
		products
			.command("list")
			.description("List all products available for comparison")
			.action(async (...args: unknown[]) => {
				const command = getActionCommand(args);
				setExitCode(
					await handleProductsList(
						dependencies,
						getJsonMode(dependencies.stdout, command),
					),
				);
			}),
	);
}
