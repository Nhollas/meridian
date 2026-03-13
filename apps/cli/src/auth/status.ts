import { writeJson, writeLines } from "@/output";
import type { ResolvedCliDependencies } from "@/runtime";
import { requireAuthentication } from "./session";

export async function handleAuthStatus(
	dependencies: ResolvedCliDependencies,
	jsonMode: boolean,
) {
	const { stdout } = dependencies;
	const credentials = await requireAuthentication(dependencies);

	if (credentials === null) {
		if (jsonMode) {
			writeJson(stdout, { authenticated: false });
		} else {
			writeLines(stdout, ["Not authenticated"]);
		}
		return 0;
	}

	if (jsonMode) {
		writeJson(stdout, {
			authenticated: true,
			user: credentials.user,
			expiresAt: credentials.expiresAt,
		});
		return 0;
	}

	writeLines(stdout, [
		"Authenticated",
		`User: ${credentials.user}`,
		`Expires at: ${credentials.expiresAt}`,
	]);
	return 0;
}
