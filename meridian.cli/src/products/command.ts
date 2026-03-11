import type { Command } from "commander";
import {
	addJsonOption,
	getActionCommand,
	getJsonMode,
} from "../cli/command-helpers.js";
import type { ResolvedCliDependencies } from "../runtime.js";
import { handleProductsList } from "./list.js";

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
