import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "@/cli";
import { createWritable } from "../../tests/support/streams";
import { createTempHome } from "../../tests/support/temp-home";

describe("proposals create", () => {
	it("creates a proposal and generates mock results", async () => {
		await using home = await createTempHome();
		await home.writeMeridianFile("credentials.json", {
			accessToken: "access-token",
			refreshToken: "refresh-token",
			user: "john.doe@example.com",
			expiresAt: "2026-03-07T16:20:00Z",
		});
		await home.writeMeridianFile("data.json", {
			proposalRequests: {
				"pr-a1b2c3d4": {
					product: "broadband",
					version: "1.0",
					emailAddress: "john.doe@example.com",
					data: {
						postcode: "AA1 1AA",
					},
					createdAt: "2026-03-06T16:20:00.000Z",
				},
			},
			proposals: {},
			results: {},
		});

		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(
			["proposals", "create", "--proposal-request=pr-a1b2c3d4", "--json"],
			{
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-06T16:20:05Z"),
				randomId: (prefix) => `${prefix}-x7y8z9`,
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout.output())).toEqual({
			id: "prop-x7y8z9",
			proposalRequestId: "pr-a1b2c3d4",
			product: "broadband",
			version: "1.0",
			status: "completed",
			createdAt: "2026-03-06T16:20:05.000Z",
		});
		expect(stderr.output()).toBe("");
		const dataStore = JSON.parse(
			await readFile(
				join(home.homeDirectory, ".meridian", "data.json"),
				"utf8",
			),
		) as {
			results: Record<string, Record<string, unknown>>;
		};
		expect(dataStore.results["prop-x7y8z9"]).toMatchObject({
			id: expect.any(String),
			product: "broadband",
			version: "1.0",
			proposalId: "prop-x7y8z9",
			sessionId: expect.any(String),
			customerId: "john.doe@example.com",
			metadata: {},
			offerings: expect.arrayContaining([
				expect.objectContaining({
					brandName: expect.any(String),
					brandCode: expect.any(String),
					providerName: expect.any(String),
					pricing: expect.objectContaining({
						paymentOptions: expect.any(Array),
					}),
					metadata: expect.any(Object),
				}),
			]),
		});
	});

	it("displays proposal details in human mode", async () => {
		await using home = await createTempHome();
		await home.writeMeridianFile("credentials.json", {
			accessToken: "access-token",
			refreshToken: "refresh-token",
			user: "john.doe@example.com",
			expiresAt: "2026-03-07T16:20:00Z",
		});
		await home.writeMeridianFile("data.json", {
			proposalRequests: {
				"pr-a1b2c3d4": {
					product: "broadband",
					version: "1.0",
					emailAddress: "john.doe@example.com",
					data: {
						postcode: "AA1 1AA",
					},
					createdAt: "2026-03-06T16:20:00.000Z",
				},
			},
			proposals: {},
			results: {},
		});

		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(
			["proposals", "create", "--proposal-request=pr-a1b2c3d4"],
			{
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-06T16:20:05Z"),
				randomId: (prefix) => `${prefix}-x7y8z9`,
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(0);
		expect(stdout.output()).toBe(
			[
				"Proposal created",
				"",
				"ID: prop-x7y8z9",
				"Proposal request: pr-a1b2c3d4",
				"Product: broadband",
				"Version: 1.0",
				"Status: completed",
				"",
			].join("\n"),
		);
		expect(stderr.output()).toBe("");
	});

	it("errors when the proposal request does not exist", async () => {
		await using home = await createTempHome();
		await home.writeMeridianFile("credentials.json", {
			accessToken: "access-token",
			refreshToken: "refresh-token",
			user: "john.doe@example.com",
			expiresAt: "2026-03-07T16:20:00Z",
		});

		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(
			["proposals", "create", "--proposal-request=pr-missing"],
			{
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-06T16:20:05Z"),
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(1);
		expect(stdout.output()).toBe("");
		expect(stderr.output()).toContain(
			'Error: Proposal request "pr-missing" not found.',
		);
	});

	it("stores a single result entity per proposal", async () => {
		await using home = await createTempHome();
		await home.writeMeridianFile("credentials.json", {
			accessToken: "access-token",
			user: "john.doe@example.com",
			expiresAt: "2026-03-07T16:20:00Z",
		});
		await home.writeMeridianFile("data.json", {
			proposalRequests: {
				"pr-a1b2c3d4": {
					product: "broadband",
					version: "1.0",
					emailAddress: "john.doe@example.com",
					data: {
						postcode: "AA1 1AA",
					},
					createdAt: "2026-03-06T16:20:00.000Z",
				},
			},
			proposals: {},
			results: {},
		});

		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(
			["proposals", "create", "--proposal-request=pr-a1b2c3d4", "--json"],
			{
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-06T16:20:05Z"),
				randomId: (prefix) => `${prefix}-x7y8z9`,
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(0);
		const dataStore = JSON.parse(
			await readFile(
				join(home.homeDirectory, ".meridian", "data.json"),
				"utf8",
			),
		) as {
			results: Record<string, Record<string, unknown>>;
		};
		expect(Array.isArray(dataStore.results["prop-x7y8z9"])).toBe(false);
		expect(dataStore.results["prop-x7y8z9"]).toMatchObject({
			id: expect.any(String),
			proposalId: "prop-x7y8z9",
			offerings: expect.any(Array),
		});
	});
});
