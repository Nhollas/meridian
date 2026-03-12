import { InvalidStoredStateError } from "../errors.js";
import { writeJson, writeLines } from "../output.js";
import type { ResolvedCliDependencies } from "../runtime.js";
import { deleteCredentials, readCredentials } from "../store/credentials.js";
import { isAccessTokenExpired } from "./lib/token.js";
import { getAuthConfig, revokeSession } from "./session.js";

export async function handleAuthLogout(
	dependencies: ResolvedCliDependencies,
	jsonMode: boolean,
) {
	const { env, fileSystem, homeDirectory, now, stdout } = dependencies;
	let credentials: Awaited<ReturnType<typeof readCredentials>> = null;
	try {
		credentials = await readCredentials(fileSystem, homeDirectory);
	} catch (error) {
		if (!(error instanceof InvalidStoredStateError)) {
			throw error;
		}
	}
	const authConfig = getAuthConfig(env);

	if (
		credentials?.refresh_token !== undefined &&
		!isAccessTokenExpired(credentials, now())
	) {
		try {
			await revokeSession(authConfig, credentials.refresh_token);
		} catch {}
	}

	await deleteCredentials(fileSystem, homeDirectory);

	if (jsonMode) {
		writeJson(stdout, { logged_out: true });
		return 0;
	}

	writeLines(stdout, ["Logged out"]);
	return 0;
}
