import { describe, expect, it } from "vitest";
import { resolveDependencies } from "@/runtime";
import {
	deleteCredentials,
	readCredentials,
	writeCredentials,
} from "@/store/credentials";
import { createTempHome } from "../../helpers/temp-home";

describe("credentials store", () => {
	it("writes then reads credentials", async () => {
		await using home = await createTempHome();
		const dependencies = resolveDependencies({
			homeDirectory: home.homeDirectory,
		});

		await writeCredentials(dependencies.fileSystem, home.homeDirectory, {
			access_token: "access-token",
			refresh_token: "refresh-token",
			user: "john.doe@example.com",
			expires_at: "2026-03-07T16:20:00Z",
		});

		await expect(
			readCredentials(dependencies.fileSystem, home.homeDirectory),
		).resolves.toEqual({
			access_token: "access-token",
			refresh_token: "refresh-token",
			user: "john.doe@example.com",
			expires_at: "2026-03-07T16:20:00Z",
		});
	});

	it("returns null when no credentials exist", async () => {
		await using home = await createTempHome();
		const dependencies = resolveDependencies({
			homeDirectory: home.homeDirectory,
		});

		await expect(
			readCredentials(dependencies.fileSystem, home.homeDirectory),
		).resolves.toBeNull();
	});

	it("deletes stored credentials", async () => {
		await using home = await createTempHome();
		const dependencies = resolveDependencies({
			homeDirectory: home.homeDirectory,
		});
		await writeCredentials(dependencies.fileSystem, home.homeDirectory, {
			access_token: "access-token",
			refresh_token: "refresh-token",
			user: "john.doe@example.com",
			expires_at: "2026-03-07T16:20:00Z",
		});

		await deleteCredentials(dependencies.fileSystem, home.homeDirectory);

		await expect(
			readCredentials(dependencies.fileSystem, home.homeDirectory),
		).resolves.toBeNull();
	});
});
