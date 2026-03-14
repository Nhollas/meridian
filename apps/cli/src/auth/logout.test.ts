import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { runCli } from "@/cli";
import { withFormBody } from "../../tests/helpers/msw-predicates";
import { createWritable } from "../../tests/helpers/streams";
import { createTempHome } from "../../tests/helpers/temp-home";
import { mswServer } from "../../tests/setup/msw";

describe("auth logout", () => {
	it("revokes the session and deletes stored credentials", async () => {
		await using home = await createTempHome();
		await home.writeMeridianFile("credentials.json", {
			accessToken: "access-token",
			refreshToken: "refresh-token",
			user: "john.doe@example.com",
			expiresAt: "2026-03-07T16:20:00Z",
		});
		const stdout = createWritable(false);
		const stderr = createWritable();
		mswServer.use(
			http.post(
				"http://localhost:8180/realms/meridian/protocol/openid-connect/logout",
				withFormBody(
					{
						client_id: "meridian-cli",
						refresh_token: "refresh-token",
					},
					() => new HttpResponse(null, { status: 204 }),
				),
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
		expect(JSON.parse(stdout.output())).toEqual({
			loggedOut: true,
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
		await using home = await createTempHome();
		const credentialsPath = join(
			home.homeDirectory,
			".meridian",
			"credentials.json",
		);
		await home.writeMeridianFile("credentials.json", {
			accessToken: "access-token",
			refreshToken: "refresh-token",
			user: "john.doe@example.com",
			expiresAt: "2026-03-07T16:20:00Z",
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
		await using home = await createTempHome();
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
		expect(JSON.parse(stdout.output())).toEqual({ loggedOut: true });
		expect(stderr.output()).toBe("");
		await expect(
			readFile(
				join(home.homeDirectory, ".meridian", "credentials.json"),
				"utf8",
			),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("clears a directory-shaped credentials path from local state", async () => {
		await using home = await createTempHome();
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
		expect(JSON.parse(stdout.output())).toEqual({ loggedOut: true });
		expect(stderr.output()).toBe("");
		await expect(
			readFile(
				join(home.homeDirectory, ".meridian", "credentials.json"),
				"utf8",
			),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("still clears local credentials when remote revoke fails", async () => {
		await using home = await createTempHome();
		await home.writeMeridianFile("credentials.json", {
			accessToken: "access-token",
			refreshToken: "refresh-token",
			user: "john.doe@example.com",
			expiresAt: "2026-03-07T16:20:00Z",
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
		expect(JSON.parse(stdout.output())).toEqual({ loggedOut: true });
		expect(stderr.output()).toBe("");
		await expect(
			readFile(
				join(home.homeDirectory, ".meridian", "credentials.json"),
				"utf8",
			),
		).rejects.toMatchObject({ code: "ENOENT" });
	});
});
