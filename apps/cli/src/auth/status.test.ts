import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { runCli } from "@/cli";
import { mswServer, withFormBody } from "../../tests/setup/msw";
import { createUnsignedJwt } from "../../tests/support/jwt";
import { createWritable } from "../../tests/support/streams";
import { createTempHome } from "../../tests/support/temp-home";

describe("auth status", () => {
	it("returns unauthenticated when no credentials are stored", async () => {
		await using home = await createTempHome();
		const stdout = createWritable(false);
		const stderr = createWritable();

		const exitCode = await runCli(["auth", "status"], {
			homeDirectory: home.homeDirectory,
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout.output())).toEqual({ authenticated: false });
		expect(stderr.output()).toBe("");
	});

	it("refreshes expired credentials before reporting status", async () => {
		await using home = await createTempHome();
		await home.writeMeridianFile("credentials.json", {
			accessToken: "expired-access",
			refreshToken: "refresh-token",
			user: "john.doe@example.com",
			expiresAt: "2026-03-06T10:00:00Z",
		});
		const stdout = createWritable(false);
		const stderr = createWritable();
		mswServer.use(
			http.post(
				"http://localhost:8180/realms/meridian/protocol/openid-connect/token",
				withFormBody(
					{
						grant_type: "refresh_token",
						client_id: "meridian-cli",
						refresh_token: "refresh-token",
					},
					() =>
						HttpResponse.json({
							access_token: "fresh-access",
							refresh_token: "fresh-refresh",
							id_token: createUnsignedJwt({
								email: "john.doe@example.com",
							}),
							expires_in: 300,
						}),
				),
			),
		);

		const exitCode = await runCli(["auth", "status"], {
			env: {
				MERIDIAN_AUTH_ISSUER: "http://localhost:8180/realms/meridian",
				MERIDIAN_AUTH_CLIENT_ID: "meridian-cli",
			},
			homeDirectory: home.homeDirectory,
			now: () => new Date("2026-03-06T10:05:00Z"),
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout.output())).toEqual({
			authenticated: true,
			user: "john.doe@example.com",
			expiresAt: "2026-03-06T10:10:00.000Z",
		});
		expect(stderr.output()).toBe("");
	});

	it("returns a structured error when credential refresh hits a transport failure", async () => {
		await using home = await createTempHome();
		await home.writeMeridianFile("credentials.json", {
			accessToken: "expired-access",
			refreshToken: "refresh-token",
			user: "john.doe@example.com",
			expiresAt: "2026-03-06T10:00:00Z",
		});
		const stdout = createWritable(false);
		const stderr = createWritable();
		mswServer.use(
			http.post(
				"http://localhost:8180/realms/meridian/protocol/openid-connect/token",
				() => HttpResponse.error(),
			),
		);

		const exitCode = await runCli(["auth", "status", "--json"], {
			env: {
				MERIDIAN_AUTH_ISSUER: "http://localhost:8180/realms/meridian",
				MERIDIAN_AUTH_CLIENT_ID: "meridian-cli",
			},
			homeDirectory: home.homeDirectory,
			now: () => new Date("2026-03-06T10:05:00Z"),
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(1);
		expect(stdout.output()).toBe("");
		expect(JSON.parse(stderr.output())).toEqual({
			error:
				'Failed to refresh stored credentials. Check MERIDIAN_AUTH_ISSUER or run "meridian auth login" again.',
		});
	});

	it("returns a structured error when stored credentials are corrupted", async () => {
		await using home = await createTempHome();
		await home.writeMeridianFile("data.json", {
			proposalRequests: {},
			proposals: {},
			results: {},
		});
		await writeFile(
			join(home.homeDirectory, ".meridian", "credentials.json"),
			"{bad json",
		);
		const stdout = createWritable(false);
		const stderr = createWritable();

		const exitCode = await runCli(["auth", "status", "--json"], {
			homeDirectory: home.homeDirectory,
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(1);
		expect(stdout.output()).toBe("");
		expect(JSON.parse(stderr.output())).toEqual({
			error:
				'Stored credentials are invalid. Run "meridian auth logout" to clear local state.',
		});
	});

	it("returns a structured error when the credentials path is a directory", async () => {
		await using home = await createTempHome();
		await mkdir(join(home.homeDirectory, ".meridian"), { recursive: true });
		await mkdir(join(home.homeDirectory, ".meridian", "credentials.json"));
		const stdout = createWritable(false);
		const stderr = createWritable();

		const exitCode = await runCli(["auth", "status", "--json"], {
			homeDirectory: home.homeDirectory,
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(1);
		expect(stdout.output()).toBe("");
		expect(JSON.parse(stderr.output())).toEqual({
			error:
				'Stored credentials are invalid. Run "meridian auth logout" to clear local state.',
		});
	});
});
