import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "@/cli";
import type { ResultRecord } from "@/store/data";
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
	} satisfies ResultRecord;
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
	} satisfies ResultRecord;
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

function parseNdjson(output: string) {
	return output
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

describe("results get", () => {
	it("streams offerings as ndjson events in json mode", async () => {
		const broadband = createBroadbandResult();
		const [skyOffering, talktalkOffering] = broadband.offerings;
		await using home = await seedHomeWithResult("broadband", broadband);
		const stdout = createWritable(false);
		const stderr = createWritable();

		const exitCode = await runCli(
			["results", "get", "--proposal=prop-x7y8z9", "--json"],
			{
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-07T16:00:00Z"),
				sleep: async () => {},
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(0);
		expect(parseNdjson(stdout.output())).toEqual([
			{ status: "pending", proposalId: "prop-x7y8z9" },
			{ status: "offering", offering: talktalkOffering },
			{ status: "offering", offering: skyOffering },
			{
				status: "complete",
				offerings: [talktalkOffering, skyOffering],
			},
		]);
		expect(stderr.output()).toBe("");
	});

	it("streams travel offerings as ndjson events in json mode", async () => {
		const travel = createTravelResult();
		const [admiralOffering, avivaOffering] = travel.offerings;
		await using home = await seedHomeWithResult("travel", travel);
		const stdout = createWritable(false);
		const stderr = createWritable();

		const exitCode = await runCli(
			["results", "get", "--proposal=prop-t1", "--json"],
			{
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-07T16:00:00Z"),
				sleep: async () => {},
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(0);
		expect(parseNdjson(stdout.output())).toEqual([
			{ status: "pending", proposalId: "prop-t1" },
			{ status: "offering", offering: avivaOffering },
			{ status: "offering", offering: admiralOffering },
			{
				status: "complete",
				offerings: [avivaOffering, admiralOffering],
			},
		]);
	});

	it("progressively renders broadband rows in human mode", async () => {
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
				sleep: async () => {},
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(0);
		expect(stdout.output()).toBe(
			[
				"Results for proposal prop-x7y8z9 (broadband)",
				"",
				"  Provider    Plan             Speed     Price       Contract   Setup",
				"  TalkTalk    Fibre 65         67Mbps    £26.00/mo   18 months  Free",
				"  Sky         Superfast 80     80Mbps    £33.00/mo   18 months  Free",
				"",
				"2 offerings sorted by price (lowest first)",
				"",
			].join("\n"),
		);
		expect(stderr.output()).toBe("");
	});

	it("progressively renders travel rows in human mode", async () => {
		await using home = await seedHomeWithResult("travel", createTravelResult());
		const stdout = createWritable(true);
		const stderr = createWritable();

		const exitCode = await runCli(["results", "get", "--proposal=prop-t1"], {
			homeDirectory: home.homeDirectory,
			now: () => new Date("2026-03-07T16:00:00Z"),
			sleep: async () => {},
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(0);
		expect(stdout.output()).toBe(
			[
				"Results for proposal prop-t1 (travel)",
				"",
				"  Provider    Plan                   Cover       Price       Excess",
				"  Aviva       Single Trip Standard   single      £12.50      £100.00",
				"  Admiral     Annual Gold            annual      £18.75      £75.00",
				"",
				"2 offerings sorted by price (lowest first)",
				"",
			].join("\n"),
		);
		expect(stderr.output()).toBe("");
	});

	it("sorts offerings by price descending when --sort=price-desc", async () => {
		await using home = await seedHomeWithResult(
			"broadband",
			createBroadbandResult(),
		);
		const stdout = createWritable(true);
		const stderr = createWritable();

		const exitCode = await runCli(
			["results", "get", "--proposal=prop-x7y8z9", "--sort=price-desc"],
			{
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-07T16:00:00Z"),
				sleep: async () => {},
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(0);
		expect(stdout.output()).toBe(
			[
				"Results for proposal prop-x7y8z9 (broadband)",
				"",
				"  Provider    Plan             Speed     Price       Contract   Setup",
				"  Sky         Superfast 80     80Mbps    £33.00/mo   18 months  Free",
				"  TalkTalk    Fibre 65         67Mbps    £26.00/mo   18 months  Free",
				"",
				"2 offerings sorted by price (highest first)",
				"",
			].join("\n"),
		);
		expect(stderr.output()).toBe("");
	});

	it("sorts offerings by provider name when --sort=provider", async () => {
		await using home = await seedHomeWithResult(
			"broadband",
			createBroadbandResult(),
		);
		const stdout = createWritable(true);
		const stderr = createWritable();

		const exitCode = await runCli(
			["results", "get", "--proposal=prop-x7y8z9", "--sort=provider"],
			{
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-07T16:00:00Z"),
				sleep: async () => {},
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(0);
		expect(stdout.output()).toBe(
			[
				"Results for proposal prop-x7y8z9 (broadband)",
				"",
				"  Provider    Plan             Speed     Price       Contract   Setup",
				"  Sky         Superfast 80     80Mbps    £33.00/mo   18 months  Free",
				"  TalkTalk    Fibre 65         67Mbps    £26.00/mo   18 months  Free",
				"",
				"2 offerings sorted by provider (A\u2013Z)",
				"",
			].join("\n"),
		);
		expect(stderr.output()).toBe("");
	});

	it("applies --sort to ndjson offering and complete events", async () => {
		const broadband = createBroadbandResult();
		const [skyOffering, talktalkOffering] = broadband.offerings;
		await using home = await seedHomeWithResult("broadband", broadband);
		const stdout = createWritable(false);
		const stderr = createWritable();

		const exitCode = await runCli(
			[
				"results",
				"get",
				"--proposal=prop-x7y8z9",
				"--json",
				"--sort=price-desc",
			],
			{
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-07T16:00:00Z"),
				sleep: async () => {},
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(0);
		expect(parseNdjson(stdout.output())).toEqual([
			{ status: "pending", proposalId: "prop-x7y8z9" },
			{ status: "offering", offering: skyOffering },
			{ status: "offering", offering: talktalkOffering },
			{
				status: "complete",
				offerings: [skyOffering, talktalkOffering],
			},
		]);
		expect(stderr.output()).toBe("");
	});

	it("calls sleep with delay values between offerings", async () => {
		await using home = await seedHomeWithResult(
			"broadband",
			createBroadbandResult(),
		);
		const stdout = createWritable(false);
		const stderr = createWritable();
		const sleepCalls: number[] = [];

		const exitCode = await runCli(
			["results", "get", "--proposal=prop-x7y8z9", "--json"],
			{
				homeDirectory: home.homeDirectory,
				now: () => new Date("2026-03-07T16:00:00Z"),
				sleep: async (ms) => {
					sleepCalls.push(ms);
				},
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(0);
		for (const ms of sleepCalls) {
			expect(ms).toBeGreaterThanOrEqual(0);
			expect(ms).toBeLessThanOrEqual(20_000);
		}
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
		const { mkdir } = await import("node:fs/promises");
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
