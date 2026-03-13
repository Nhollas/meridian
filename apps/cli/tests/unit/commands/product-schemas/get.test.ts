import { describe, expect, it } from "vitest";
import { runCli } from "@/cli";
import { createWritable } from "../../../helpers/streams";

describe("product-schemas get", () => {
	it("accepts the spaced version option form", async () => {
		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(
			["product-schemas", "get", "--product", "broadband", "--version", "1.0"],
			{
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout.output())).toMatchObject({
			$schema: "https://json-schema.org/draft/2020-12/schema",
			type: "object",
			required: ["emailAddress", "data"],
		});
		expect(stderr.output()).toBe("");
	});

	it("prints the schema as json by default", async () => {
		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(
			["product-schemas", "get", "--product=broadband", "--version=1.0"],
			{
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout.output())).toMatchObject({
			$schema: "https://json-schema.org/draft/2020-12/schema",
			type: "object",
			required: ["emailAddress", "data"],
			properties: {
				emailAddress: {
					type: "string",
					format: "email",
				},
				data: {
					type: "object",
					required: ["postcode"],
				},
			},
		});
		expect(JSON.parse(stdout.output())).not.toHaveProperty("product");
		expect(JSON.parse(stdout.output())).not.toHaveProperty("version");
		expect(JSON.parse(stdout.output())).not.toHaveProperty("schema");
		expect(stderr.output()).toBe("");
	});

	it("prints the same json schema when stdout is a tty", async () => {
		const stdout = createWritable(true);
		const stderr = createWritable();

		const exitCode = await runCli(
			["product-schemas", "get", "--product=broadband", "--version=1.0"],
			{
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout.output())).toMatchObject({
			$schema: "https://json-schema.org/draft/2020-12/schema",
			type: "object",
			required: ["emailAddress", "data"],
		});
		expect(stderr.output()).toBe("");
	});

	it("includes nested product fields in the returned schema", async () => {
		const stdout = createWritable(true);
		const stderr = createWritable();

		const exitCode = await runCli(
			["product-schemas", "get", "--product=travel", "--version=1.0"],
			{
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout.output())).toMatchObject({
			properties: {
				data: {
					properties: {
						travellers: {
							properties: {
								adults: {
									type: "number",
								},
								children: {
									type: "number",
								},
							},
						},
					},
				},
			},
		});
		expect(stderr.output()).toBe("");
	});

	it("returns an error when the requested schema does not exist", async () => {
		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(
			["product-schemas", "get", "--product=broadband", "--version=2.0"],
			{
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(1);
		expect(stdout.output()).toBe("");
		expect(stderr.output()).toContain(
			'Error: No schema found for product "broadband" version "2.0".',
		);
		expect(stderr.output()).toContain("Available versions: 1.0");
	});

	it("returns a structured error when --json is passed for a missing schema", async () => {
		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(
			[
				"product-schemas",
				"get",
				"--product=broadband",
				"--version=2.0",
				"--json",
			],
			{
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(1);
		expect(stdout.output()).toBe("");
		expect(JSON.parse(stderr.output())).toEqual({
			error: 'No schema found for product "broadband" version "2.0".',
			availableVersions: ["1.0"],
		});
	});

	it("accepts the standard json flag even though success output is always json", async () => {
		const stdout = createWritable();
		const stderr = createWritable();

		const exitCode = await runCli(
			[
				"product-schemas",
				"get",
				"--product=broadband",
				"--version=1.0",
				"--json",
			],
			{
				stdout: stdout.stream,
				stderr: stderr.stream,
			},
		);

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout.output())).toMatchObject({
			$schema: "https://json-schema.org/draft/2020-12/schema",
			type: "object",
			required: ["emailAddress", "data"],
		});
		expect(stderr.output()).toBe("");
	});
});
