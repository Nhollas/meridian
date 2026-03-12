import { readFileSync } from "node:fs";
import { Command, CommanderError } from "commander";
import { registerAuthCommands } from "./auth/command";
import { writeError } from "./cli/command-helpers";
import {
	InputFileParseError,
	InputFileReadError,
	InvalidStoredStateError,
} from "./errors";
import { configureProcessNetworking } from "./network/proxy";
import { getOutputMode } from "./output";
import { registerProductSchemaCommands } from "./product-schemas/command";
import { registerProductsCommands } from "./products/command";
import { registerProposalRequestCommands } from "./proposal-requests/command";
import { registerProposalCommands } from "./proposals/command";
import { registerResultCommands } from "./results/command";
import {
	type CliDependencies,
	type ResolvedCliDependencies,
	resolveDependencies,
} from "./runtime";

const packageJson = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

function createProgram(
	dependencies: ResolvedCliDependencies,
	setExitCode: (code: number) => void,
) {
	const { stderr, stdout } = dependencies;
	const program = new Command();

	program
		.name("meridian")
		.description("Meridian CLI")
		.usage("<command> [options]")
		.helpOption("-h, --help", "Show help for any command")
		.addHelpText(
			"afterAll",
			"\nGlobal options:\n  -V, --version  Show CLI version\n",
		)
		.addHelpText("after", () => {
			return [
				"",
				"Example workflow:",
				"  1. Authenticate (if needed)",
				"       meridian auth status --json",
				"       meridian auth login --json",
				"     Most commands require authentication. Login uses Device Flow",
				"     and emits newline-delimited JSON. Keep the command running",
				"     until it emits a final status.",
				"",
				"  2. Discover products and their schemas",
				"       meridian products list --json",
				"       meridian product-schemas get --product <name> --version <ver>",
				"     The schema is the source of truth for what a comparison",
				"     requires — use it to determine the exact fields to collect.",
				"",
				"  3. Create a proposal request from a JSON file",
				"       meridian proposal-requests create --product <name> --version <ver> --file <path> --json",
				"     The request file must conform to the product schema. Build it",
				"     from collected answers rather than assuming or hard-coding values.",
				"",
				"  4. Create a proposal and retrieve results",
				"       meridian proposals create --proposal-request <id> --json",
				"       meridian results get --proposal <id> --json",
				"     A proposal triggers the actual comparison. Results may take a",
				"     moment to become available.",
				"",
			].join("\n");
		})
		.showSuggestionAfterError(false)
		.allowExcessArguments(false)
		.configureOutput({
			outputError() {},
			writeErr(chunk) {
				stderr.write(chunk);
			},
			writeOut(chunk) {
				stdout.write(chunk);
			},
		})
		.exitOverride();
	registerAuthCommands(program, dependencies, setExitCode);
	registerProductsCommands(program, dependencies, setExitCode);
	registerProductSchemaCommands(program, dependencies, setExitCode);
	registerProposalRequestCommands(program, dependencies, setExitCode);
	registerProposalCommands(program, dependencies, setExitCode);
	registerResultCommands(program, dependencies, setExitCode);

	return program;
}

function formatCommanderErrorMessage(error: CommanderError) {
	const message = error.message.replace(/^error:\s*/i, "");

	if (error.code === "commander.unknownCommand") {
		const match = /unknown command '(.+)'/.exec(message);
		return match === null
			? "Unknown command."
			: `Unknown command "${match[1]}".`;
	}

	if (error.code === "commander.unknownOption") {
		const match = /unknown option '(.+)'/.exec(message);
		return match === null ? "Unknown option." : `Unknown option "${match[1]}".`;
	}

	if (error.code === "commander.missingMandatoryOptionValue") {
		return message.replace(/^required option /, "Missing required option ");
	}

	if (error.code === "commander.optionMissingArgument") {
		return message.replace(/^option /, "Option ");
	}

	return message.charAt(0).toUpperCase() + message.slice(1);
}

function isHandledCliError(error: unknown) {
	return (
		error instanceof InputFileParseError ||
		error instanceof InputFileReadError ||
		error instanceof InvalidStoredStateError
	);
}

export async function runCli(
	argv: string[],
	dependencies: CliDependencies = {},
): Promise<number> {
	const resolvedDependencies = resolveDependencies(dependencies);
	configureProcessNetworking(resolvedDependencies.env);
	const jsonMode =
		getOutputMode(resolvedDependencies.stdout, argv.includes("--json")) ===
		"json";
	let exitCode = 0;
	const program = createProgram(resolvedDependencies, (code) => {
		exitCode = code;
	});

	if (argv.length === 0) {
		program.outputHelp();
		return 0;
	}

	if (argv.length === 1 && (argv[0] === "--version" || argv[0] === "-V")) {
		resolvedDependencies.stdout.write(`${packageJson.version}\n`);
		return 0;
	}

	try {
		await program.parseAsync(argv, { from: "user" });
		return exitCode;
	} catch (error) {
		if (error instanceof CommanderError) {
			if (
				error.code === "commander.help" ||
				error.code === "commander.helpDisplayed" ||
				error.code === "commander.version"
			) {
				return 0;
			}

			writeError(
				resolvedDependencies.stderr,
				jsonMode,
				formatCommanderErrorMessage(error),
			);
			return 2;
		}

		if (isHandledCliError(error)) {
			writeError(resolvedDependencies.stderr, jsonMode, error.message);
			return 1;
		}

		if (error instanceof Error) {
			writeError(resolvedDependencies.stderr, jsonMode, error.message);
			return 1;
		}

		writeError(resolvedDependencies.stderr, jsonMode, "Unexpected error.");
		return 1;
	}
}

export async function main() {
	const exitCode = await runCli(process.argv.slice(2));
	process.exitCode = exitCode;
}
