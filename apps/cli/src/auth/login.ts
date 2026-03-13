import { writeJsonLine, writeLines } from "@/output";
import type { ResolvedCliDependencies } from "@/runtime";
import { writeCredentials } from "@/store/credentials";
import {
	pollDeviceAuthorisation,
	requestDeviceAuthorisation,
} from "./lib/device-flow";
import { getAuthConfig } from "./session";

export async function handleAuthLogin(
	dependencies: ResolvedCliDependencies,
	jsonMode: boolean,
) {
	const { env, fileSystem, homeDirectory, now, sleep, stdout } = dependencies;
	const authConfig = getAuthConfig(env);

	const deviceAuthorisation = await requestDeviceAuthorisation(authConfig, {
		now,
		sleep,
	});

	if (jsonMode) {
		writeJsonLine(stdout, {
			intervalSeconds: deviceAuthorisation.interval,
			verificationUriComplete: deviceAuthorisation.verificationUriComplete,
			userCode: deviceAuthorisation.userCode,
			status: "pending",
		});
	} else {
		writeLines(stdout, [
			"To sign in, open this URL in your browser:",
			"",
			`  ${deviceAuthorisation.verificationUriComplete}`,
			"",
			`Enter code: ${deviceAuthorisation.userCode}`,
			"",
			"Waiting for authentication...",
		]);
	}

	const loginResult = await pollDeviceAuthorisation(
		authConfig,
		deviceAuthorisation,
		{
			now,
			sleep,
		},
	);
	await writeCredentials(fileSystem, homeDirectory, loginResult.credentials);

	if (jsonMode) {
		writeJsonLine(stdout, {
			intervalSeconds: deviceAuthorisation.interval,
			verificationUriComplete: loginResult.verificationUriComplete,
			userCode: loginResult.userCode,
			status: "authenticated",
			user: loginResult.credentials.user,
			expiresAt: loginResult.credentials.expiresAt,
		});
		return 0;
	}

	writeLines(stdout, [
		"done",
		"",
		`Authenticated as ${loginResult.credentials.user}`,
		`Token stored in ${homeDirectory}/.meridian/credentials.json`,
	]);
	return 0;
}
