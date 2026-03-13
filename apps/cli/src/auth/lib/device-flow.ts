import { z } from "zod";
import { AuthDeviceFlowError } from "@/errors";
import type { StoredCredentials } from "@/store/credentials";
import { type AuthConfig, extractUserFromIdToken } from "./token";

type DeviceFlowDependencies = {
	now: () => Date;
	sleep: (milliseconds: number) => Promise<void>;
};

const deviceAuthorizationResponseSchema = z.object({
	device_code: z.string().min(1),
	interval: z.number().int().positive().optional(),
	user_code: z.string().min(1),
	verification_uri_complete: z.string().url(),
});

const tokenSuccessResponseSchema = z.object({
	access_token: z.string().min(1),
	expires_in: z.number().int().positive(),
	id_token: z.string().min(1).optional(),
	refresh_token: z.string().min(1).optional(),
});

const tokenErrorResponseSchema = z.object({
	error: z.string().min(1).optional(),
});

const HOST_DOCKER_INTERNAL = "host.docker.internal";

async function parseResponse<TSchema extends z.ZodType>(
	response: Response,
	schema: TSchema,
	errorMessage: string,
): Promise<z.infer<TSchema>> {
	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw new AuthDeviceFlowError(errorMessage);
	}

	const parsed = schema.safeParse(payload);
	if (!parsed.success) {
		throw new AuthDeviceFlowError(errorMessage);
	}

	return parsed.data;
}

export type DeviceAuthorisationDetails = {
	device_code: string;
	interval: number;
	user_code: string;
	verification_uri_complete: string;
};

export async function requestDeviceAuthorisation(
	authConfig: AuthConfig,
	_dependencies: DeviceFlowDependencies,
): Promise<DeviceAuthorisationDetails> {
	let deviceResponse: Response;
	try {
		deviceResponse = await fetch(
			`${authConfig.issuer}/protocol/openid-connect/auth/device`,
			{
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					client_id: authConfig.clientId,
					scope: "openid email profile",
				}).toString(),
			},
		);
	} catch {
		throw new AuthDeviceFlowError();
	}

	if (!deviceResponse.ok) {
		throw new AuthDeviceFlowError("Device authorisation request failed");
	}

	const devicePayload = await parseResponse(
		deviceResponse,
		deviceAuthorizationResponseSchema,
		"Invalid device authorisation response from Keycloak.",
	);

	return {
		device_code: devicePayload.device_code,
		interval: devicePayload.interval ?? 5,
		user_code: devicePayload.user_code,
		verification_uri_complete: normalizeVerificationUriComplete(
			devicePayload.verification_uri_complete,
		),
	};
}

export async function pollDeviceAuthorisation(
	authConfig: AuthConfig,
	deviceAuthorisation: DeviceAuthorisationDetails,
	dependencies: DeviceFlowDependencies,
): Promise<{
	credentials: StoredCredentials;
	user_code: string;
	verification_uri_complete: string;
}> {
	let intervalMilliseconds = deviceAuthorisation.interval * 1000;

	while (true) {
		let tokenResponse: Response;
		try {
			tokenResponse = await fetch(
				`${authConfig.issuer}/protocol/openid-connect/token`,
				{
					method: "POST",
					headers: {
						"content-type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						grant_type: "urn:ietf:params:oauth:grant-type:device_code",
						client_id: authConfig.clientId,
						device_code: deviceAuthorisation.device_code,
					}).toString(),
				},
			);
		} catch {
			throw new AuthDeviceFlowError();
		}

		if (tokenResponse.ok) {
			const tokenPayload = await parseResponse(
				tokenResponse,
				tokenSuccessResponseSchema,
				"Invalid token response from Keycloak.",
			);
			const user =
				tokenPayload.id_token === undefined
					? undefined
					: extractUserFromIdToken(tokenPayload.id_token);
			if (user === undefined) {
				throw new AuthDeviceFlowError(
					"Unable to determine the authenticated user from the identity token.",
				);
			}

			return {
				verification_uri_complete:
					deviceAuthorisation.verification_uri_complete,
				user_code: deviceAuthorisation.user_code,
				credentials: {
					access_token: tokenPayload.access_token,
					user,
					expires_at: new Date(
						dependencies.now().getTime() + tokenPayload.expires_in * 1000,
					).toISOString(),
					...(tokenPayload.refresh_token === undefined
						? {}
						: { refresh_token: tokenPayload.refresh_token }),
					...(tokenPayload.id_token === undefined
						? {}
						: { id_token: tokenPayload.id_token }),
				},
			};
		}

		const errorPayload = await parseResponse(
			tokenResponse,
			tokenErrorResponseSchema,
			"Invalid token error response from Keycloak.",
		);

		if (errorPayload.error === "authorization_pending") {
			await dependencies.sleep(intervalMilliseconds);
			continue;
		}

		if (errorPayload.error === "slow_down") {
			intervalMilliseconds += 5000;
			await dependencies.sleep(intervalMilliseconds);
			continue;
		}

		throw new AuthDeviceFlowError(
			errorPayload.error ?? "Device authorisation failed",
		);
	}
}

export async function authenticateWithDeviceFlow(
	authConfig: AuthConfig,
	dependencies: DeviceFlowDependencies,
) {
	const deviceAuthorisation = await requestDeviceAuthorisation(
		authConfig,
		dependencies,
	);

	return pollDeviceAuthorisation(authConfig, deviceAuthorisation, dependencies);
}

function normalizeVerificationUriComplete(uri: string): string {
	try {
		const parsed = new URL(uri);
		if (parsed.hostname !== HOST_DOCKER_INTERNAL) {
			return uri;
		}

		parsed.hostname = "localhost";
		return parsed.toString();
	} catch {
		return uri;
	}
}
