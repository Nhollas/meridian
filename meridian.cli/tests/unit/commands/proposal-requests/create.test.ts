import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../../../src/cli.js";
import { createWritable } from "../../../helpers/streams.js";
import { createTempHome } from "../../../helpers/temp-home.js";
import { mswServer } from "../../../setup/msw.js";

const homes: Array<{ cleanup(): Promise<void> }> = [];

afterEach(async () => {
	await Promise.all(homes.splice(0).map((home) => home.cleanup()));
});

describe("proposal-requests create", () => {
	it("accepts the spaced version option form", async () => {
		const home = await createTempHome();
		homes.push(home);
		const inputFile = join(home.homeDirectory, "broadband.json");
		await writeFile(
			inputFile,
			JSON.stringify({
				emailAddress: "john.doe@example.com",
				data: {
					postcode: "PE2 6YS",
					current_provider: "BT",
					preferences: {
						max_monthly_cost: 40,
					},
				},
			}),
		);
		await home.writeMeridianFile("credentials.json", {
			access_token: "access-token",
			refresh_token: "refresh-token",
			user: "john.doe@example.com",
			expires_at: "2026-03-07T16:20:00Z",
		});

		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(
			[
				"proposal-requests",
				"create",
				"--product",
				"broadband",
				"--version",
				"1.0",
				"--file",
				inputFile,
				"--json",
			],
			{
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-06T16:20:00Z"),
				randomId: (prefix) => `${prefix}-a1b2c3d4`,
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout.output())).toEqual({
			id: "pr-a1b2c3d4",
			product: "broadband",
			version: "1.0",
			status: "draft",
			created_at: "2026-03-06T16:20:00.000Z",
		});
		expect(stderr.output()).toBe("");
	});

	it("creates a proposal request from a valid json file", async () => {
		const home = await createTempHome();
		homes.push(home);
		const inputFile = join(home.homeDirectory, "broadband.json");
		await writeFile(
			inputFile,
			JSON.stringify({
				emailAddress: "john.doe@example.com",
				data: {
					postcode: "PE2 6YS",
					current_provider: "BT",
					preferences: {
						max_monthly_cost: 40,
					},
				},
			}),
		);
		await home.writeMeridianFile("credentials.json", {
			access_token: "access-token",
			refresh_token: "refresh-token",
			user: "john.doe@example.com",
			expires_at: "2026-03-07T16:20:00Z",
		});

		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(
			[
				"proposal-requests",
				"create",
				"--product=broadband",
				"--version=1.0",
				`--file=${inputFile}`,
				"--json",
			],
			{
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-06T16:20:00Z"),
				randomId: (prefix) => `${prefix}-a1b2c3d4`,
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout.output())).toEqual({
			id: "pr-a1b2c3d4",
			product: "broadband",
			version: "1.0",
			status: "draft",
			created_at: "2026-03-06T16:20:00.000Z",
		});
		expect(stderr.output()).toBe("");
	});

	it("rejects invalid input files with validation issues", async () => {
		const home = await createTempHome();
		homes.push(home);
		const inputFile = join(home.homeDirectory, "invalid.json");
		await writeFile(
			inputFile,
			JSON.stringify({
				emailAddress: "not-an-email",
				data: {},
			}),
		);
		await home.writeMeridianFile("credentials.json", {
			access_token: "access-token",
			refresh_token: "refresh-token",
			user: "john.doe@example.com",
			expires_at: "2026-03-07T16:20:00Z",
		});

		const stdout = createWritable(false);
		const stderr = createWritable();

		const exitCode = await runCli(
			[
				"proposal-requests",
				"create",
				"--product=broadband",
				"--version=1.0",
				`--file=${inputFile}`,
			],
			{
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-06T16:20:00Z"),
				randomId: (prefix) => `${prefix}-a1b2c3d4`,
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(1);
		expect(JSON.parse(stderr.output())).toEqual({
			error: "Validation failed",
			issues: [
				{
					path: "emailAddress",
					message: "Must be a valid email address",
				},
				{
					path: "data.postcode",
					message: "Invalid input: expected string, received undefined",
				},
			],
		});
		expect(stdout.output()).toBe("");
	});

	it("returns a structured error when the input file contains invalid json", async () => {
		const home = await createTempHome();
		homes.push(home);
		const inputFile = join(home.homeDirectory, "invalid-json.json");
		await writeFile(inputFile, "{invalid json");
		await home.writeMeridianFile("credentials.json", {
			access_token: "access-token",
			refresh_token: "refresh-token",
			user: "john.doe@example.com",
			expires_at: "2026-03-07T16:20:00Z",
		});

		const stdout = createWritable(false);
		const stderr = createWritable();

		const exitCode = await runCli(
			[
				"proposal-requests",
				"create",
				"--product=broadband",
				"--version=1.0",
				`--file=${inputFile}`,
				"--json",
			],
			{
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-06T16:20:00Z"),
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(1);
		expect(stdout.output()).toBe("");
		expect(JSON.parse(stderr.output())).toEqual({
			error: `Input file "${inputFile}" contains invalid JSON.`,
		});
	});

	it("returns a structured error when the input file cannot be read", async () => {
		const home = await createTempHome();
		homes.push(home);
		const inputFile = join(home.homeDirectory, "missing.json");
		await home.writeMeridianFile("credentials.json", {
			access_token: "access-token",
			refresh_token: "refresh-token",
			user: "john.doe@example.com",
			expires_at: "2026-03-07T16:20:00Z",
		});

		const stdout = createWritable(false);
		const stderr = createWritable();

		const exitCode = await runCli(
			[
				"proposal-requests",
				"create",
				"--product=broadband",
				"--version=1.0",
				`--file=${inputFile}`,
				"--json",
			],
			{
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-06T16:20:00Z"),
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(1);
		expect(stdout.output()).toBe("");
		expect(JSON.parse(stderr.output())).toEqual({
			error: `Input file "${inputFile}" could not be read.`,
		});
	});

	it("requires authentication before creating a proposal request", async () => {
		const home = await createTempHome();
		homes.push(home);
		const inputFile = join(home.homeDirectory, "broadband.json");
		await writeFile(
			inputFile,
			JSON.stringify({
				emailAddress: "john.doe@example.com",
				data: {
					postcode: "PE2 6YS",
				},
			}),
		);

		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(
			[
				"proposal-requests",
				"create",
				"--product=broadband",
				"--version=1.0",
				`--file=${inputFile}`,
			],
			{
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-06T16:20:00Z"),
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(1);
		expect(stdout.output()).toBe("");
		expect(stderr.output()).toContain(
			'Error: Not authenticated. Run "meridian auth login" first.',
		);
	});

	it("refreshes expired credentials before creating a proposal request", async () => {
		const home = await createTempHome();
		homes.push(home);
		const inputFile = join(home.homeDirectory, "broadband.json");
		await writeFile(
			inputFile,
			JSON.stringify({
				emailAddress: "john.doe@example.com",
				data: {
					postcode: "PE2 6YS",
				},
			}),
		);
		await home.writeMeridianFile("credentials.json", {
			access_token: "expired-access",
			refresh_token: "refresh-token",
			user: "john.doe@example.com",
			expires_at: "2026-03-06T10:00:00Z",
		});

		const stdout = createWritable(false);
		const stderr = createWritable();
		mswServer.use(
			http.post(
				"http://localhost:8180/realms/meridian/protocol/openid-connect/token",
				() =>
					HttpResponse.json({
						access_token: "fresh-access",
						refresh_token: "fresh-refresh",
						id_token: [
							"eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0",
							"eyJlbWFpbCI6Im5pY2hvbGFzLmhvbGxhc0Bjb21wYXJldGhlbWFya2V0LmNvbSJ9",
							"",
						].join("."),
						expires_in: 300,
					}),
			),
		);

		const exitCode = await runCli(
			[
				"proposal-requests",
				"create",
				"--product=broadband",
				"--version=1.0",
				`--file=${inputFile}`,
			],
			{
				env: {
					MERIDIAN_AUTH_ISSUER: "http://localhost:8180/realms/meridian",
					MERIDIAN_AUTH_CLIENT_ID: "meridian-cli",
				},
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-06T10:05:00Z"),
				randomId: (prefix) => `${prefix}-a1b2c3d4`,
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout.output())).toMatchObject({
			id: "pr-a1b2c3d4",
		});
		expect(stderr.output()).toBe("");
	});

	it("shows subcommand help instead of validating flags", async () => {
		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(["proposal-requests", "create", "--help"], {
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(0);
		expect(stdout.output()).toContain(
			"Usage: meridian proposal-requests create",
		);
		expect(stdout.output()).toContain("--product");
		expect(stdout.output()).toContain("--file");
		expect(stderr.output()).toBe("");
	});
});
