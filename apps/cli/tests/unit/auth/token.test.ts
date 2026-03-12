import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import {
	extractUserFromIdToken,
	isAccessTokenExpired,
	refreshStoredCredentials,
} from "../../../src/auth/lib/token.js";
import { createUnsignedJwt } from "../../helpers/jwt.js";
import { mswServer } from "../../setup/msw.js";

const issuer = "http://localhost:8180/realms/meridian";
const tokenUrl = `${issuer}/protocol/openid-connect/token`;

describe("token", () => {
	it("detects whether an access token is expired", () => {
		expect(
			isAccessTokenExpired(
				{ expires_at: "2026-03-06T10:00:00Z" },
				new Date("2026-03-06T10:00:01Z"),
			),
		).toBe(true);
		expect(
			isAccessTokenExpired(
				{ expires_at: "2026-03-06T10:00:00Z" },
				new Date("2026-03-06T09:59:59Z"),
			),
		).toBe(false);
	});

	it("extracts the user from an id token", () => {
		expect(
			extractUserFromIdToken(
				createUnsignedJwt({
					email: "john.doe@example.com",
				}),
			),
		).toBe("john.doe@example.com");
	});

	it("returns undefined when the id token payload is malformed", () => {
		expect(extractUserFromIdToken("not.a.valid.jwt")).toBeUndefined();
	});

	it("refreshes expired credentials using the refresh token", async () => {
		mswServer.use(
			http.post(tokenUrl, async ({ request }) => {
				expect(await request.text()).toBe(
					"grant_type=refresh_token&client_id=meridian-cli&refresh_token=old-refresh",
				);
				return HttpResponse.json({
					access_token: "new-access",
					refresh_token: "new-refresh",
					id_token: createUnsignedJwt({
						email: "john.doe@example.com",
					}),
					expires_in: 300,
				});
			}),
		);

		const refreshed = await refreshStoredCredentials(
			{
				access_token: "old-access",
				refresh_token: "old-refresh",
				user: "john.doe@example.com",
				expires_at: "2026-03-06T10:00:00Z",
			},
			{
				issuer,
				clientId: "meridian-cli",
			},
			{
				now: () => new Date("2026-03-06T10:05:00Z"),
			},
		);

		expect(refreshed).toEqual({
			access_token: "new-access",
			refresh_token: "new-refresh",
			id_token: expect.any(String),
			user: "john.doe@example.com",
			expires_at: "2026-03-06T10:10:00.000Z",
		});
	});

	it("returns null when the refresh response shape is invalid", async () => {
		mswServer.use(
			http.post(tokenUrl, () =>
				HttpResponse.json({
					token: "new-access",
				}),
			),
		);

		await expect(
			refreshStoredCredentials(
				{
					access_token: "old-access",
					refresh_token: "old-refresh",
					user: "john.doe@example.com",
					expires_at: "2026-03-06T10:00:00Z",
				},
				{
					issuer,
					clientId: "meridian-cli",
				},
				{
					now: () => new Date("2026-03-06T10:05:00Z"),
				},
			),
		).resolves.toBeNull();
	});

	it("falls back to the existing user when the refreshed id token payload is malformed", async () => {
		mswServer.use(
			http.post(tokenUrl, () =>
				HttpResponse.json({
					access_token: "new-access",
					refresh_token: "new-refresh",
					id_token: "not.a.valid.jwt",
					expires_in: 300,
				}),
			),
		);

		await expect(
			refreshStoredCredentials(
				{
					access_token: "old-access",
					refresh_token: "old-refresh",
					user: "john.doe@example.com",
					expires_at: "2026-03-06T10:00:00Z",
				},
				{
					issuer,
					clientId: "meridian-cli",
				},
				{
					now: () => new Date("2026-03-06T10:05:00Z"),
				},
			),
		).resolves.toEqual({
			access_token: "new-access",
			refresh_token: "new-refresh",
			id_token: "not.a.valid.jwt",
			user: "john.doe@example.com",
			expires_at: "2026-03-06T10:10:00.000Z",
		});
	});
});
