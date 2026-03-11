import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import {
	DEFAULT_AUTH_CLIENT_ID,
	DEFAULT_AUTH_ISSUER,
} from "../../../../src/auth/session.js";
import { runCli } from "../../../../src/cli.js";
import { createUnsignedJwt } from "../../../helpers/jwt.js";
import { createWritable } from "../../../helpers/streams.js";
import { createTempHome } from "../../../helpers/temp-home.js";
import { mswServer } from "../../../setup/msw.js";

const homes: Array<{ cleanup(): Promise<void> }> = [];

afterEach(async () => {
	await Promise.all(homes.splice(0).map((home) => home.cleanup()));
});

describe("auth login", () => {
	it("uses the official Meridian auth defaults when no overrides are set", async () => {
		const home = await createTempHome();
		homes.push(home);
		const stdout = createWritable(false);
		const stderr = createWritable();
		let requestBody = "";
		mswServer.use(
			http.post(
				`${DEFAULT_AUTH_ISSUER}/protocol/openid-connect/auth/device`,
				async ({ request }) => {
					requestBody = await request.text();
					return HttpResponse.json({
						device_code: "device-code",
						user_code: "ABCD-1234",
						verification_uri_complete: `${DEFAULT_AUTH_ISSUER}/device?user_code=ABCD-1234`,
						interval: 5,
					});
				},
			),
			http.post(`${DEFAULT_AUTH_ISSUER}/protocol/openid-connect/token`, () =>
				HttpResponse.json({
					access_token: "access-token",
					refresh_token: "refresh-token",
					id_token: createUnsignedJwt({
						email: "john.doe@example.com",
					}),
					expires_in: 300,
				}),
			),
		);

		const exitCode = await runCli(["auth", "login", "--json"], {
			homeDirectory: home.homeDirectory,
			now: () => new Date("2026-03-06T12:00:00Z"),
			sleep: async () => {},
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(0);
		expect(requestBody).toContain(`client_id=${DEFAULT_AUTH_CLIENT_ID}`);
		expect(stdout.output()).toContain('"status":"pending"');
		expect(stdout.output()).toContain('"status":"authenticated"');
		expect(stderr.output()).toBe("");
	});

	it("prints device details immediately before authentication completes", async () => {
		const home = await createTempHome();
		homes.push(home);
		const stdout = createWritable(false);
		const stderr = createWritable();
		let tokenPolls = 0;
		let releaseSleep = () => {};
		mswServer.use(
			http.post(
				"http://localhost:8180/realms/meridian/protocol/openid-connect/auth/device",
				() =>
					HttpResponse.json({
						device_code: "device-code",
						user_code: "ABCD-1234",
						verification_uri_complete:
							"http://localhost:8180/device?user_code=ABCD-1234",
						interval: 5,
					}),
			),
			http.post(
				"http://localhost:8180/realms/meridian/protocol/openid-connect/token",
				() => {
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
				},
			),
		);

		const exitCodePromise = runCli(["auth", "login", "--json"], {
			env: {
				MERIDIAN_AUTH_ISSUER: "http://localhost:8180/realms/meridian",
				MERIDIAN_AUTH_CLIENT_ID: "meridian-cli",
			},
			homeDirectory: home.homeDirectory,
			now: () => new Date("2026-03-06T12:00:00Z"),
			sleep: () =>
				new Promise<void>((resolve) => {
					releaseSleep = resolve;
				}),
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});

		expect(stdout.output()).toContain('"status":"pending"');
		expect(stdout.output()).toContain('"user_code":"ABCD-1234"');
		expect(stderr.output()).toBe("");

		releaseSleep();

		await expect(exitCodePromise).resolves.toBe(0);
		expect(stdout.output()).toContain('"status":"authenticated"');
	});

	it("completes the device flow and stores credentials", async () => {
		const home = await createTempHome();
		homes.push(home);
		const stdout = createWritable(false);
		const stderr = createWritable();
		let tokenPolls = 0;
		mswServer.use(
			http.post(
				"http://localhost:8180/realms/meridian/protocol/openid-connect/auth/device",
				() =>
					HttpResponse.json({
						device_code: "device-code",
						user_code: "ABCD-1234",
						verification_uri_complete:
							"http://localhost:8180/device?user_code=ABCD-1234",
						interval: 5,
					}),
			),
			http.post(
				"http://localhost:8180/realms/meridian/protocol/openid-connect/token",
				() => {
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
				},
			),
		);

		const exitCode = await runCli(["auth", "login"], {
			env: {
				MERIDIAN_AUTH_ISSUER: "http://localhost:8180/realms/meridian",
				MERIDIAN_AUTH_CLIENT_ID: "meridian-cli",
			},
			homeDirectory: home.homeDirectory,
			now: () => new Date("2026-03-06T12:00:00Z"),
			sleep: async () => {},
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(0);
		expect(
			stdout
				.output()
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line)),
		).toEqual([
			{
				interval_seconds: 5,
				verification_uri_complete:
					"http://localhost:8180/device?user_code=ABCD-1234",
				user_code: "ABCD-1234",
				status: "pending",
			},
			{
				interval_seconds: 5,
				verification_uri_complete:
					"http://localhost:8180/device?user_code=ABCD-1234",
				user_code: "ABCD-1234",
				status: "authenticated",
				user: "john.doe@example.com",
				expires_at: "2026-03-06T12:05:00.000Z",
			},
		]);
		expect(stderr.output()).toBe("");
	});

	it("returns a structured error when the device authorisation request has a transport failure", async () => {
		const home = await createTempHome();
		homes.push(home);
		const stdout = createWritable(false);
		const stderr = createWritable();
		mswServer.use(
			http.post(
				"http://localhost:8180/realms/meridian/protocol/openid-connect/auth/device",
				() => HttpResponse.error(),
			),
		);

		const exitCode = await runCli(["auth", "login", "--json"], {
			env: {
				MERIDIAN_AUTH_ISSUER: "http://localhost:8180/realms/meridian",
				MERIDIAN_AUTH_CLIENT_ID: "meridian-cli",
			},
			homeDirectory: home.homeDirectory,
			now: () => new Date("2026-03-06T12:00:00Z"),
			sleep: async () => {},
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(1);
		expect(stdout.output()).toBe("");
		expect(JSON.parse(stderr.output())).toEqual({
			error:
				"Authentication service is unavailable. Check MERIDIAN_AUTH_ISSUER and try again.",
		});
	});

	it("returns a structured error when token polling has a transport failure", async () => {
		const home = await createTempHome();
		homes.push(home);
		const stdout = createWritable(false);
		const stderr = createWritable();
		mswServer.use(
			http.post(
				"http://localhost:8180/realms/meridian/protocol/openid-connect/auth/device",
				() =>
					HttpResponse.json({
						device_code: "device-code",
						user_code: "ABCD-1234",
						verification_uri_complete:
							"http://localhost:8180/device?user_code=ABCD-1234",
						interval: 5,
					}),
			),
			http.post(
				"http://localhost:8180/realms/meridian/protocol/openid-connect/token",
				() => HttpResponse.error(),
			),
		);

		const exitCode = await runCli(["auth", "login", "--json"], {
			env: {
				MERIDIAN_AUTH_ISSUER: "http://localhost:8180/realms/meridian",
				MERIDIAN_AUTH_CLIENT_ID: "meridian-cli",
			},
			homeDirectory: home.homeDirectory,
			now: () => new Date("2026-03-06T12:00:00Z"),
			sleep: async () => {},
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(1);
		expect(stdout.output()).toContain('"status":"pending"');
		expect(JSON.parse(stderr.output())).toEqual({
			error:
				"Authentication service is unavailable. Check MERIDIAN_AUTH_ISSUER and try again.",
		});
	});
});
