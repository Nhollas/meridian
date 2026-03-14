import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runCli } from "@/cli";
import { createWritable } from "../tests/support/streams";

const packageJson = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

describe("cli", () => {
	it("prints top-level help with the standard short flag", async () => {
		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(["-h"], {
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(0);
		expect(stdout.output()).toContain("Meridian CLI");
		expect(stdout.output()).toContain("Usage: meridian <command> [options]");
		expect(stderr.output()).toBe("");
	});

	it("prints top-level help", async () => {
		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(["--help"], {
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(0);
		expect(stdout.output()).toContain("Meridian CLI");
		expect(stdout.output()).toContain("meridian <command> [options]");
		expect(stdout.output()).toContain("--version");
		expect(stdout.output()).toContain("products");
		expect(stderr.output()).toBe("");
	});

	it("prints version", async () => {
		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(["--version"], {
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(0);
		expect(stdout.output().trim()).toBe(packageJson.version);
		expect(stderr.output()).toBe("");
	});

	it("prints version with the standard short flag", async () => {
		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(["-V"], {
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(0);
		expect(stdout.output().trim()).toBe(packageJson.version);
		expect(stderr.output()).toBe("");
	});

	it("returns a usage error for an unknown command", async () => {
		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(["wat"], {
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(2);
		expect(stdout.output()).toBe("");
		expect(stderr.output()).toContain('Error: Unknown command "wat".');
	});

	it("returns an unknown-command error for mistyped grouped subcommands", async () => {
		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(["auth", "sttaus"], {
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(2);
		expect(stdout.output()).toBe("");
		expect(stderr.output()).toContain('Error: Unknown command "sttaus".');
		expect(stderr.output()).not.toContain("too many arguments");
	});

	it("formats excess argument errors without duplicating the prefix", async () => {
		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(["products", "list", "extra"], {
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(exitCode).toBe(2);
		expect(stdout.output()).toBe("");
		expect(stderr.output()).toContain(
			"Error: Too many arguments for 'list'. Expected 0 arguments but got 1.",
		);
		expect(stderr.output()).not.toContain("Error: Error:");
	});
});
