import { InvalidStoredStateError } from "@/errors";
import { writeJson, writeLines } from "@/output";
import type { ResolvedCliDependencies } from "@/runtime";
import { deleteCredentials, readCredentials } from "@/store/credentials";
import { isAccessTokenExpired } from "./lib/token";
import { getAuthConfig, revokeSession } from "./session";

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
