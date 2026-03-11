import type { Command } from "commander";
import {
	addJsonOption,
	getActionCommand,
	getJsonMode,
} from "../cli/command-helpers.js";
import type { ResolvedCliDependencies } from "../runtime.js";
import { handleAuthLogin } from "./login.js";
import { handleAuthLogout } from "./logout.js";
import { handleAuthStatus } from "./status.js";

export function registerAuthCommands(
	program: Command,
	dependencies: ResolvedCliDependencies,
	setExitCode: (code: number) => void,
) {
	const auth = program.command("auth").description("Manage authentication");

	addJsonOption(
		auth
			.command("login")
			.description("Authenticate via browser (device flow)")
			.action(async (...args: unknown[]) => {
				const command = getActionCommand(args);
				setExitCode(
					await handleAuthLogin(
						dependencies,
						getJsonMode(dependencies.stdout, command),
					),
				);
			}),
	);

	addJsonOption(
		auth
			.command("status")
			.description("Show current authentication state")
			.action(async (...args: unknown[]) => {
				const command = getActionCommand(args);
				setExitCode(
					await handleAuthStatus(
						dependencies,
						getJsonMode(dependencies.stdout, command),
					),
				);
			}),
	);

	addJsonOption(
		auth
			.command("logout")
			.description("Remove stored credentials")
			.action(async (...args: unknown[]) => {
				const command = getActionCommand(args);
				setExitCode(
					await handleAuthLogout(
						dependencies,
						getJsonMode(dependencies.stdout, command),
					),
				);
			}),
	);
}
