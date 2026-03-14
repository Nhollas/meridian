import { describe, expect, it } from "vitest";
import { resolveDependencies } from "@/runtime";
import { readDataStore, writeDataStore } from "@/store/data";
import { createTempHome } from "../../tests/helpers/temp-home";

describe("data store", () => {
	it("returns an empty store when the file does not exist", async () => {
		await using home = await createTempHome();
		const dependencies = resolveDependencies({
			homeDirectory: home.homeDirectory,
		});

		await expect(
			readDataStore(dependencies.fileSystem, home.homeDirectory),
		).resolves.toEqual({
			proposalRequests: {},
			proposals: {},
			results: {},
		});
	});

	it("persists the data store to disk", async () => {
		await using home = await createTempHome();
		const dependencies = resolveDependencies({
			homeDirectory: home.homeDirectory,
		});
		const payload = {
			proposalRequests: {
				"pr-a1b2c3d4": {
					product: "broadband",
					version: "1.0",
					emailAddress: "john.doe@example.com",
					data: { postcode: "AA1 1AA" },
					createdAt: "2026-03-06T16:20:00.000Z",
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
