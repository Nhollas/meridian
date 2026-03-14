import type { Command } from "commander";
import {
	addJsonOption,
	getActionCommand,
	getJsonMode,
} from "@/command-helpers";
import type { ResolvedCliDependencies } from "@/runtime";
import { handleProductSchemasGet, type ProductSchemaOptions } from "./get";

export function registerProductSchemaCommands(
	program: Command,
	dependencies: ResolvedCliDependencies,
	setExitCode: (code: number) => void,
) {
	const productSchemas = program
		.command("product-schemas")
		.description("Product data schemas");

	addJsonOption(
		productSchemas
			.command("get")
			.description("Get the JSON schema for a product and version")
			.requiredOption("--product <product>", "Product name")
			.requiredOption("--version <version>", "Schema version")
			.action(async (...args: unknown[]) => {
				const command = getActionCommand(args);
				const options = command.opts<ProductSchemaOptions>();
				setExitCode(
					await handleProductSchemasGet(
						dependencies,
						options,
						getJsonMode(dependencies.stdout, command),
					),
				);
			}),
	);
}
