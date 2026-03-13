import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import {
	authenticateWithDeviceFlow,
	pollDeviceAuthorisation,
	requestDeviceAuthorisation,
} from "@/auth/lib/device-flow";
import { AuthDeviceFlowError } from "@/errors";
import { createUnsignedJwt } from "../../helpers/jwt";
import { mswServer } from "../../setup/msw";

const issuer = "http://localhost:8180/realms/meridian";
const authDeviceUrl = `${issuer}/protocol/openid-connect/auth/device`;
const tokenUrl = `${issuer}/protocol/openid-connect/token`;

describe("device flow", () => {
	it("requests a device code then polls until authentication completes", async () => {
		const sleeps: number[] = [];
		let tokenPolls = 0;

		mswServer.use(
			http.post(authDeviceUrl, async ({ request }) => {
				expect(await request.text()).toBe(
					"client_id=meridian-cli&scope=openid+email+profile",
				);
				return HttpResponse.json({
					device_code: "device-code",
					user_code: "ABCD-1234",
					verification_uri_complete:
						"http://localhost:8180/device?user_code=ABCD-1234",
					interval: 5,
				});
			}),
			http.post(tokenUrl, () => {
				tokenPolls += 1;
				if (tokenPolls === 1) {
					return HttpResponse.json(
						{ error: "authorization_pending" },
						{ status: 400 },
					);
				}

				return HttpResponse.json({
					access_token: "access-token",
					refresh_token: "refresh-token",
					id_token: createUnsignedJwt({
						email: "john.doe@example.com",
					}),
					expires_in: 300,
				});
			}),
		);

		const result = await authenticateWithDeviceFlow(
			{
				issuer,
				clientId: "meridian-cli",
			},
			{
				now: () => new Date("2026-03-06T12:00:00Z"),
				sleep: async (milliseconds) => {
					sleeps.push(milliseconds);
				},
			},
		);

		expect(sleeps).toEqual([5000]);
		expect(result).toEqual({
			verificationUriComplete:
				"http://localhost:8180/device?user_code=ABCD-1234",
			userCode: "ABCD-1234",
			credentials: {
				accessToken: "access-token",
				refreshToken: "refresh-token",
				idToken: expect.any(String),
				user: "john.doe@example.com",
				expiresAt: "2026-03-06T12:05:00.000Z",
			},
		});
	});

	it("normalizes host.docker.internal verification URLs for the browser flow", async () => {
		mswServer.use(
			http.post(authDeviceUrl, () =>
				HttpResponse.json({
					device_code: "device-code",
					user_code: "ABCD-1234",
					verification_uri_complete:
						"http://host.docker.internal:8080/realms/meridian/device?user_code=ABCD-1234",
					interval: 5,
				}),
			),
		);

		const result = await requestDeviceAuthorisation(
			{
				issuer,
				clientId: "meridian-cli",
			},
			{
				now: () => new Date("2026-03-06T12:00:00Z"),
				sleep: async () => {},
			},
		);

		expect(result).toEqual({
			deviceCode: "device-code",
			interval: 5,
			userCode: "ABCD-1234",
			verificationUriComplete:
				"http://localhost:8080/realms/meridian/device?user_code=ABCD-1234",
		});
	});

	it("fails when the device authorisation response shape is invalid", async () => {
		mswServer.use(
			http.post(authDeviceUrl, () =>
				HttpResponse.json({
					device_code: "device-code",
				}),
			),
		);

		await expect(
			requestDeviceAuthorisation(
				{
					issuer,
					clientId: "meridian-cli",
				},
				{
					now: () => new Date("2026-03-06T12:00:00Z"),
					sleep: async () => {},
				},
			),
		).rejects.toThrow(AuthDeviceFlowError);
	});

	it("fails with an auth device flow error when device authorisation is rejected", async () => {
		mswServer.use(
			http.post(authDeviceUrl, () =>
				HttpResponse.json(
					{
						error: "invalid_client",
					},
					{ status: 400 },
				),
			),
		);

		await expect(
			requestDeviceAuthorisation(
				{
					issuer,
					clientId: "meridian-cli",
				},
				{
					now: () => new Date("2026-03-06T12:00:00Z"),
					sleep: async () => {},
				},
			),
		).rejects.toThrow(AuthDeviceFlowError);
	});

	it("fails when the token success response shape is invalid", async () => {
		mswServer.use(
			http.post(tokenUrl, () =>
				HttpResponse.json({
					token: "access-token",
				}),
			),
		);

		await expect(
			pollDeviceAuthorisation(
				{
					issuer,
					clientId: "meridian-cli",
				},
				{
					deviceCode: "device-code",
					interval: 5,
					userCode: "ABCD-1234",
					verificationUriComplete:
						"http://localhost:8180/device?user_code=ABCD-1234",
				},
				{
					now: () => new Date("2026-03-06T12:00:00Z"),
					sleep: async () => {},
				},
			),
		).rejects.toThrow(AuthDeviceFlowError);
	});

	it("fails when the id token payload is malformed", async () => {
		mswServer.use(
			http.post(tokenUrl, () =>
				HttpResponse.json({
					access_token: "access-token",
					refresh_token: "refresh-token",
					id_token: "not.a.valid.jwt",
					expires_in: 300,
				}),
			),
		);

		await expect(
			pollDeviceAuthorisation(
				{
					issuer,
					clientId: "meridian-cli",
				},
				{
					deviceCode: "device-code",
					interval: 5,
					userCode: "ABCD-1234",
					verificationUriComplete:
						"http://localhost:8180/device?user_code=ABCD-1234",
				},
				{
					now: () => new Date("2026-03-06T12:00:00Z"),
					sleep: async () => {},
				},
			),
		).rejects.toThrow(AuthDeviceFlowError);
	});

	it("fails when the token response does not include an id token", async () => {
		mswServer.use(
			http.post(tokenUrl, () =>
				HttpResponse.json({
					access_token: "access-token",
					refresh_token: "refresh-token",
					expires_in: 300,
				}),
			),
		);

		await expect(
			pollDeviceAuthorisation(
				{
					issuer,
					clientId: "meridian-cli",
				},
				{
					deviceCode: "device-code",
					interval: 5,
					userCode: "ABCD-1234",
					verificationUriComplete:
						"http://localhost:8180/device?user_code=ABCD-1234",
				},
				{
					now: () => new Date("2026-03-06T12:00:00Z"),
					sleep: async () => {},
				},
			),
		).rejects.toThrow(AuthDeviceFlowError);
	});
});
