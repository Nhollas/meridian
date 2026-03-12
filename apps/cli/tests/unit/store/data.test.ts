import { afterEach, describe, expect, it } from "vitest";
import { resolveDependencies } from "@/runtime";
import { readDataStore, writeDataStore } from "@/store/data";
import { createTempHome } from "../../helpers/temp-home";

const homes: Array<{ cleanup(): Promise<void>; homeDirectory: string }> = [];

afterEach(async () => {
	await Promise.all(homes.splice(0).map((home) => home.cleanup()));
});

describe("data store", () => {
	it("returns an empty store when the file does not exist", async () => {
		const home = await createTempHome();
		homes.push(home);
		const dependencies = resolveDependencies({
			homeDirectory: home.homeDirectory,
		});

		await expect(
			readDataStore(dependencies.fileSystem, home.homeDirectory),
		).resolves.toEqual({
			proposal_requests: {},
			proposals: {},
			results: {},
		});
	});

	it("persists the data store to disk", async () => {
		const home = await createTempHome();
		homes.push(home);
		const dependencies = resolveDependencies({
			homeDirectory: home.homeDirectory,
		});
		const payload = {
			proposal_requests: {
				"pr-a1b2c3d4": {
					product: "broadband",
					version: "1.0",
					emailAddress: "john.doe@example.com",
					data: { postcode: "AA1 1AA" },
					created_at: "2026-03-06T16:20:00.000Z",
				},
			},
			proposals: {},
			results: {},
		};

		await writeDataStore(dependencies.fileSystem, home.homeDirectory, payload);

		await expect(
			readDataStore(dependencies.fileSystem, home.homeDirectory),
		).resolves.toEqual(payload);
	});
});
