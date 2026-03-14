import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "@/cli";
import { createWritable } from "../../tests/support/streams";
import { createTempHome } from "../../tests/support/temp-home";

function createBroadbandResult() {
	return {
		id: "result-broadband",
		product: "broadband",
		version: "1.0",
		proposalId: "prop-x7y8z9",
		sessionId: "session-pr-a1b2c3d4",
		customerId: "john.doe@example.com",
		metadata: {},
		offerings: [
			{
				brandName: "Superfast 80",
				brandCode: "sky-superfast-80",
				providerName: "Sky",
				pricing: {
					paymentOptions: [
						{
							type: "Installment",
							totalCost: 594,
							installmentDetails: {
								deposit: 0,
								numberOfPayments: 18,
								installmentAmount: 33,
								apr: null,
							},
						},
					],
				},
				metadata: {
					speed: "80Mbps",
					contractMonths: 18,
					setupFee: 0,
				},
			},
			{
				brandName: "Fibre 65",
				brandCode: "talktalk-fibre-65",
				providerName: "TalkTalk",
				pricing: {
					paymentOptions: [
						{
							type: "Installment",
							totalCost: 468,
							installmentDetails: {
								deposit: 0,
								numberOfPayments: 18,
								installmentAmount: 26,
								apr: null,
							},
						},
					],
				},
				metadata: {
					speed: "67Mbps",
					contractMonths: 18,
					setupFee: 0,
				},
			},
		],
	};
}

function createTravelResult() {
	return {
		id: "result-travel",
		product: "travel",
		version: "1.0",
		proposalId: "prop-t1",
		sessionId: "session-pr-t1",
		customerId: "john.doe@example.com",
		metadata: {},
		offerings: [
			{
				brandName: "Annual Gold",
				brandCode: "admiral-annual-gold",
				providerName: "Admiral",
				pricing: {
					paymentOptions: [
						{
							type: "OneTime",
							totalCost: 18.75,
							installmentDetails: null,
						},
					],
				},
				metadata: {
					coverLevel: "annual",
					excess: 75,
				},
			},
			{
				brandName: "Single Trip Standard",
				brandCode: "aviva-single-trip-standard",
				providerName: "Aviva",
				pricing: {
					paymentOptions: [
						{
							type: "OneTime",
							totalCost: 12.5,
							installmentDetails: null,
						},
					],
				},
				metadata: {
					coverLevel: "single",
					excess: 100,
				},
			},
		],
	};
}

async function seedHomeWithResult(
	product: "broadband" | "travel",
	result:
		| ReturnType<typeof createBroadbandResult>
		| ReturnType<typeof createTravelResult>,
) {
	const home = await createTempHome();
	await home.writeMeridianFile("credentials.json", {
		accessToken: "access-token",
		user: "john.doe@example.com",
		expiresAt: "2026-03-07T16:20:00Z",
	});
	const proposalId = result.proposalId;
	const proposalRequestId = product === "broadband" ? "pr-a1b2c3d4" : "pr-t1";
	await home.writeMeridianFile("data.json", {
		proposalRequests: {
			[proposalRequestId]: {
				product,
				version: "1.0",
				emailAddress: "john.doe@example.com",
				data:
					product === "broadband"
						? { postcode: "AA1 1AA" }
						: { destination: "Spain" },
				createdAt: "2026-03-06T16:20:00.000Z",
			},
		},
		proposals: {
			[proposalId]: {
				proposalRequestId,
				product,
				version: "1.0",
				status: "completed",
				createdAt: "2026-03-06T16:20:05.000Z",
			},
		},
		results: {
			[proposalId]: result,
		},
	});
	return home;
}

describe("results get", () => {
	it("returns a single result entity in json mode", async () => {
		await using home = await seedHomeWithResult(
			"broadband",
			createBroadbandResult(),
		);
		const stdout = createWritable(false);
		const stderr = createWritable();

		const exitCode = await runCli(
			["results", "get", "--proposal=prop-x7y8z9"],
			{
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-07T16:00:00Z"),
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout.output())).toEqual({
			id: "result-broadband",
			product: "broadband",
			version: "1.0",
			proposalId: "prop-x7y8z9",
			sessionId: "session-pr-a1b2c3d4",
			customerId: "john.doe@example.com",
			metadata: {},
			offerings: [
				{
					brandName: "Fibre 65",
					brandCode: "talktalk-fibre-65",
					providerName: "TalkTalk",
					pricing: {
						paymentOptions: [
							{
								type: "Installment",
								totalCost: 468,
								installmentDetails: {
									deposit: 0,
									numberOfPayments: 18,
									installmentAmount: 26,
									apr: null,
								},
							},
						],
					},
					metadata: {
						speed: "67Mbps",
						contractMonths: 18,
						setupFee: 0,
					},
				},
				{
					brandName: "Superfast 80",
					brandCode: "sky-superfast-80",
					providerName: "Sky",
					pricing: {
						paymentOptions: [
							{
								type: "Installment",
								totalCost: 594,
								installmentDetails: {
									deposit: 0,
									numberOfPayments: 18,
									installmentAmount: 33,
									apr: null,
								},
							},
						],
					},
					metadata: {
						speed: "80Mbps",
						contractMonths: 18,
						setupFee: 0,
					},
				},
			],
		});
		expect(stderr.output()).toBe("");
	});

	it("prints a human-friendly broadband table from offerings", async () => {
		await using home = await seedHomeWithResult(
			"broadband",
			createBroadbandResult(),
		);
		const stdout = createWritable(true);
		const stderr = createWritable();

		const exitCode = await runCli(
			["results", "get", "--proposal=prop-x7y8z9"],
			{
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-07T16:00:00Z"),
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(0);
		expect(stdout.output()).toContain("Results for proposal prop-x7y8z9");
		expect(stdout.output()).toContain("TalkTalk");
		expect(stdout.output()).toContain("Sky");
		expect(stdout.output()).toContain("£26.00/mo");
		expect(stdout.output()).toContain("2 offerings sorted by price");
		expect(stderr.output()).toBe("");
	});

	it("prints a travel-specific human-friendly table from offerings", async () => {
		await using home = await seedHomeWithResult("travel", createTravelResult());
		const stdout = createWritable(true);
		const stderr = createWritable();

		const exitCode = await runCli(["results", "get", "--proposal=prop-t1"], {
			homeDirectory: home.homeDirectory,
			now: () => new Date("2026-03-07T16:00:00Z"),
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(0);
		expect(stdout.output()).toContain("Results for proposal prop-t1 (travel)");
		expect(stdout.output()).toContain("Single Trip Standard");
		expect(stdout.output()).toContain("single");
		expect(stdout.output()).toContain("£12.50");
		expect(stdout.output()).toContain("2 offerings sorted by price");
		expect(stdout.output()).not.toContain("Speed");
		expect(stderr.output()).toBe("");
	});

	it("returns a structured error when the local data store is corrupted", async () => {
		await using home = await createTempHome();
		await home.writeMeridianFile("credentials.json", {
			accessToken: "access-token",
			user: "john.doe@example.com",
			expiresAt: "2026-03-07T16:20:00Z",
		});
		await writeFile(
			join(home.homeDirectory, ".meridian", "data.json"),
			"{bad json",
		);

		const stdout = createWritable(false);
		const stderr = createWritable();

		const exitCode = await runCli(
			["results", "get", "--proposal=prop-any", "--json"],
			{
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-07T16:00:00Z"),
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(1);
		expect(stdout.output()).toBe("");
		expect(JSON.parse(stderr.output())).toEqual({
			error:
				'Local data store is invalid. Remove "~/.meridian/data.json" or re-run the workflow to rebuild it.',
		});
	});

	it("returns a structured error when the data store path is a directory", async () => {
		await using home = await createTempHome();
		await home.writeMeridianFile("credentials.json", {
			accessToken: "access-token",
			user: "john.doe@example.com",
			expiresAt: "2026-03-07T16:20:00Z",
		});
		await mkdir(join(home.homeDirectory, ".meridian", "data.json"));

		const stdout = createWritable(false);
		const stderr = createWritable();

		const exitCode = await runCli(
			["results", "get", "--proposal=prop-any", "--json"],
			{
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-07T16:00:00Z"),
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(1);
		expect(stdout.output()).toBe("");
		expect(JSON.parse(stderr.output())).toEqual({
			error:
				'Local data store is invalid. Remove "~/.meridian/data.json" or re-run the workflow to rebuild it.',
		});
	});
});
