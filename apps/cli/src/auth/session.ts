import type { ResolvedCliDependencies } from "@/runtime";
import { readCredentials, writeCredentials } from "@/store/credentials";
import {
	type AuthConfig,
	isAccessTokenExpired,
	refreshStoredCredentials,
} from "./lib/token";

export const DEFAULT_AUTH_ISSUER = "http://localhost:8080/realms/meridian";
export const DEFAULT_AUTH_CLIENT_ID = "meridian-cli";

function getConfiguredValue(
	value: string | undefined,
	defaultValue: string,
): string {
	const trimmedValue = value?.trim();

	return trimmedValue && trimmedValue.length > 0 ? trimmedValue : defaultValue;
}

export function getAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
	const issuer = getConfiguredValue(
		env["MERIDIAN_AUTH_ISSUER"],
		DEFAULT_AUTH_ISSUER,
	);
	const clientId = getConfiguredValue(
		env["MERIDIAN_AUTH_CLIENT_ID"],
		DEFAULT_AUTH_CLIENT_ID,
	);

	return { issuer, clientId };
}

export async function revokeSession(
	authConfig: AuthConfig,
	refreshToken: string,
) {
	await fetch(`${authConfig.issuer}/protocol/openid-connect/logout`, {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({
			client_id: authConfig.clientId,
			refresh_token: refreshToken,
		}).toString(),
	});
}

export async function requireAuthentication(
	dependencies: ResolvedCliDependencies,
) {
	const { env, fileSystem, homeDirectory, now } = dependencies;
	const credentials = await readCredentials(fileSystem, homeDirectory);

	if (credentials === null) {
		return null;
	}

	if (!isAccessTokenExpired(credentials, now())) {
		return credentials;
	}

	const authConfig = getAuthConfig(env);
	const refreshed = await refreshStoredCredentials(credentials, authConfig, {
		now,
	});

	if (refreshed === null) {
		return null;
	}

	await writeCredentials(fileSystem, homeDirectory, refreshed);
	return refreshed;
}
