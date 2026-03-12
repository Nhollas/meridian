import { writeJsonLine, writeLines } from "../output.js";
import type { ResolvedCliDependencies } from "../runtime.js";
import { writeCredentials } from "../store/credentials.js";
import {
	pollDeviceAuthorisation,
	requestDeviceAuthorisation,
} from "./lib/device-flow.js";
import { getAuthConfig } from "./session.js";

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
			interval_seconds: deviceAuthorisation.interval,
			verification_uri_complete: deviceAuthorisation.verification_uri_complete,
			user_code: deviceAuthorisation.user_code,
			status: "pending",
		});
	} else {
		writeLines(stdout, [
			"To sign in, open this URL in your browser:",
			"",
			`  ${deviceAuthorisation.verification_uri_complete}`,
			"",
			`Enter code: ${deviceAuthorisation.user_code}`,
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
			interval_seconds: deviceAuthorisation.interval,
			verification_uri_complete: loginResult.verification_uri_complete,
			user_code: loginResult.user_code,
			status: "authenticated",
			user: loginResult.credentials.user,
			expires_at: loginResult.credentials.expires_at,
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
