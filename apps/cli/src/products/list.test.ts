import { describe, expect, it } from "vitest";
import { runCli } from "@/cli";
import { createWritable } from "../../tests/helpers/streams";

describe("products list", () => {
	it("prints product catalogue as json when requested", async () => {
		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(["products", "list", "--json"], {
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout.output())).toEqual({
			products: [
				{
					name: "broadband",
					description:
						"Compare broadband deals by speed, price, and contract length",
					versions: [{ version: "1.0", status: "current" }],
				},
				{
					name: "travel",
					description:
						"Compare travel insurance policies by destination, cover level, and trip type",
					versions: [{ version: "1.0", status: "current" }],
				},
			],
		});
		expect(stderr.output()).toBe("");
	});

	it("defaults to json when stdout is not a tty", async () => {
		const stdout = createWritable(false);
		const stderr = createWritable();

		const exitCode = await runCli(["products", "list"], {
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout.output())).toMatchObject({
			products: expect.any(Array),
		});
		expect(stderr.output()).toBe("");
	});

	it("defaults to json when stdout does not expose isTTY", async () => {
		const stdoutChunks: string[] = [];
		const stderr = createWritable();

		const exitCode = await runCli(["products", "list"], {
			stdout: {
				write(chunk: string) {
					stdoutChunks.push(chunk);
				},
			},
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdoutChunks.join(""))).toMatchObject({
			products: expect.any(Array),
		});
		expect(stderr.output()).toBe("");
	});

	it("prints a human-friendly list for interactive terminals", async () => {
		const stdout = createWritable(true);
		const stderr = createWritable();

		const exitCode = await runCli(["products", "list"], {
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(0);
		expect(stdout.output()).toContain("Available products");
		expect(stdout.output()).toContain("broadband");
		expect(stdout.output()).toContain("travel");
		expect(stdout.output()).toContain("2 products available");
		expect(stderr.output()).toBe("");
	});

	it("rejects unknown flags with a usage error", async () => {
		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(["products", "list", "--bogus"], {
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(2);
		expect(stdout.output()).toBe("");
		expect(stderr.output()).toContain("--bogus");
	});
});
