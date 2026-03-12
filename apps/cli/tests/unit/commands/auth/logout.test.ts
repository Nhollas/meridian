import { mkdir, readFile, writeFile } from "node:fs/promises";
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

describe("auth logout", () => {
	it("revokes the session and deletes stored credentials", async () => {
		const home = await createTempHome();
		homes.push(home);
		await home.writeMeridianFile("credentials.json", {
			access_token: "access-token",
			refresh_token: "refresh-token",
			user: "john.doe@example.com",
			expires_at: "2026-03-07T16:20:00Z",
		});
		const stdout = createWritable(false);
		const stderr = createWritable();
		let requestBody = "";
		mswServer.use(
			http.post(
				"http://localhost:8180/realms/meridian/protocol/openid-connect/logout",
				async ({ request }) => {
					requestBody = await request.text();
					return new HttpResponse(null, { status: 204 });
				},
			),
		);

		const exitCode = await runCli(["auth", "logout"], {
			env: {
				MERIDIAN_AUTH_ISSUER: "http://localhost:8180/realms/meridian",
				MERIDIAN_AUTH_CLIENT_ID: "meridian-cli",
			},
			homeDirectory: home.homeDirectory,
			now: () => new Date("2026-03-07T16:00:00Z"),
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(0);
		expect(requestBody).toBe(
			"client_id=meridian-cli&refresh_token=refresh-token",
		);
		expect(JSON.parse(stdout.output())).toEqual({
			logged_out: true,
		});
		expect(stderr.output()).toBe("");
		await expect(
			readFile(
				join(home.homeDirectory, ".meridian", "credentials.json"),
				"utf8",
			),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("shows help without deleting stored credentials", async () => {
		const home = await createTempHome();
		homes.push(home);
		const credentialsPath = join(
			home.homeDirectory,
			".meridian",
			"credentials.json",
		);
		await home.writeMeridianFile("credentials.json", {
			access_token: "access-token",
			refresh_token: "refresh-token",
			user: "john.doe@example.com",
			expires_at: "2026-03-07T16:20:00Z",
		});
		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(["auth", "logout", "--help"], {
			homeDirectory: home.homeDirectory,
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(0);
		expect(stdout.output()).toContain("Usage: meridian auth logout");
		expect(stdout.output()).toContain("Remove stored credentials");
		expect(stderr.output()).toBe("");
		await expect(readFile(credentialsPath, "utf8")).resolves.toContain(
			"access-token",
		);
	});

	it("clears corrupted credentials from local state", async () => {
		const home = await createTempHome();
		homes.push(home);
		await mkdir(join(home.homeDirectory, ".meridian"), { recursive: true });
		await writeFile(
			join(home.homeDirectory, ".meridian", "credentials.json"),
			"{bad json",
		);
		const stdout = createWritable(false);
		const stderr = createWritable();

		const exitCode = await runCli(["auth", "logout", "--json"], {
			homeDirectory: home.homeDirectory,
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout.output())).toEqual({ logged_out: true });
		expect(stderr.output()).toBe("");
		await expect(
			readFile(
				join(home.homeDirectory, ".meridian", "credentials.json"),
				"utf8",
			),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("clears a directory-shaped credentials path from local state", async () => {
		const home = await createTempHome();
		homes.push(home);
		await mkdir(join(home.homeDirectory, ".meridian"), { recursive: true });
		await mkdir(join(home.homeDirectory, ".meridian", "credentials.json"));
		const stdout = createWritable(false);
		const stderr = createWritable();

		const exitCode = await runCli(["auth", "logout", "--json"], {
			homeDirectory: home.homeDirectory,
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout.output())).toEqual({ logged_out: true });
		expect(stderr.output()).toBe("");
		await expect(
			readFile(
				join(home.homeDirectory, ".meridian", "credentials.json"),
				"utf8",
			),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("still clears local credentials when remote revoke fails", async () => {
		const home = await createTempHome();
		homes.push(home);
		await home.writeMeridianFile("credentials.json", {
			access_token: "access-token",
			refresh_token: "refresh-token",
			user: "john.doe@example.com",
			expires_at: "2026-03-07T16:20:00Z",
		});
		const stdout = createWritable(false);
		const stderr = createWritable();
		mswServer.use(
			http.post(
				"http://localhost:8180/realms/meridian/protocol/openid-connect/logout",
				() => HttpResponse.error(),
			),
		);

		const exitCode = await runCli(["auth", "logout", "--json"], {
			env: {
				MERIDIAN_AUTH_ISSUER: "http://localhost:8180/realms/meridian",
				MERIDIAN_AUTH_CLIENT_ID: "meridian-cli",
			},
			homeDirectory: home.homeDirectory,
			now: () => new Date("2026-03-07T16:00:00Z"),
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout.output())).toEqual({ logged_out: true });
		expect(stderr.output()).toBe("");
		await expect(
			readFile(
				join(home.homeDirectory, ".meridian", "credentials.json"),
				"utf8",
			),
		).rejects.toMatchObject({ code: "ENOENT" });
	});
});
