import { z } from "zod";
import { AuthRefreshError } from "@/errors";
import type { StoredCredentials } from "@/store/credentials";

export type AuthConfig = {
	clientId: string;
	issuer: string;
};

type RefreshDependencies = {
	now: () => Date;
};

const tokenResponseSchema = z.object({
	access_token: z.string().min(1),
	expires_in: z.number().int().positive(),
	id_token: z.string().min(1).optional(),
	refresh_token: z.string().min(1).optional(),
});

const idTokenClaimsSchema = z.object({
	email: z.string().optional(),
	preferred_username: z.string().optional(),
	sub: z.string().optional(),
});

async function parseTokenResponse(
	response: Response,
): Promise<z.infer<typeof tokenResponseSchema> | null> {
	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		return null;
	}

	const parsed = tokenResponseSchema.safeParse(payload);
	return parsed.success ? parsed.data : null;
}

export function isAccessTokenExpired(
	credentials: Pick<StoredCredentials, "expiresAt">,
	now: Date,
) {
	return new Date(credentials.expiresAt).getTime() <= now.getTime();
}

export function extractUserFromIdToken(idToken: string) {
	const [, payload] = idToken.split(".");
	if (payload === undefined) {
		return undefined;
	}

	let decodedPayload: unknown;
	try {
		decodedPayload = JSON.parse(
			Buffer.from(payload, "base64url").toString("utf8"),
		);
	} catch {
		return undefined;
	}

	const parsed = idTokenClaimsSchema.safeParse(decodedPayload);
	if (!parsed.success) {
		return undefined;
	}

	return parsed.data.email ?? parsed.data.preferred_username ?? parsed.data.sub;
}

export async function refreshStoredCredentials(
	credentials: StoredCredentials,
	authConfig: AuthConfig,
	dependencies: RefreshDependencies,
): Promise<StoredCredentials | null> {
	if (credentials.refreshToken === undefined) {
		return null;
	}

	let response: Response;
	try {
		response = await fetch(
			`${authConfig.issuer}/protocol/openid-connect/token`,
			{
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					grant_type: "refresh_token",
					client_id: authConfig.clientId,
					refresh_token: credentials.refreshToken,
				}).toString(),
			},
		);
	} catch {
		throw new AuthRefreshError();
	}

	if (!response.ok) {
		return null;
	}

	const payload = await parseTokenResponse(response);
	if (payload === null) {
		return null;
	}
	const user =
		(payload.id_token === undefined
			? credentials.user
			: extractUserFromIdToken(payload.id_token)) ?? credentials.user;

	return {
		accessToken: payload.access_token,
		refreshToken: payload.refresh_token ?? credentials.refreshToken,
		user,
		expiresAt: new Date(
			dependencies.now().getTime() + payload.expires_in * 1000,
		).toISOString(),
		...(payload.id_token === undefined ? {} : { idToken: payload.id_token }),
	};
}
