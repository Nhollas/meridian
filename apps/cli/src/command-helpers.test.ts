import { describe, expect, it } from "vitest";
import { createWritable } from "../tests/support/streams";
import { writeError } from "./command-helpers";

describe("writeError", () => {
	it("writes JSON error in json mode", () => {
		const stderr = createWritable();

		writeError(stderr.stream, true, "Something broke");

		expect(JSON.parse(stderr.output())).toEqual({
			error: "Something broke",
		});
	});

	it("includes additional details in JSON output", () => {
		const stderr = createWritable();

		writeError(stderr.stream, true, "Validation failed", {
			issues: [{ path: "name", message: "Required" }],
		});

		expect(JSON.parse(stderr.output())).toEqual({
			error: "Validation failed",
			issues: [{ path: "name", message: "Required" }],
		});
	});

	it("writes human-readable error in non-json mode", () => {
		const stderr = createWritable();

		writeError(stderr.stream, false, "Something broke");

		expect(stderr.output()).toBe("Error: Something broke\n");
	});

	it("lists validation issues in human mode", () => {
		const stderr = createWritable();

		writeError(stderr.stream, false, "Validation failed", {
			issues: [
				{ path: "email", message: "Must be valid" },
				{ path: "data.postcode", message: "Required" },
			],
		});

		const output = stderr.output();
		expect(output).toContain("Error: Validation failed");
		expect(output).toContain("  email: Must be valid");
		expect(output).toContain("  data.postcode: Required");
	});

	it("shows (root) for issues with empty path", () => {
		const stderr = createWritable();

		writeError(stderr.stream, false, "Validation failed", {
			issues: [{ path: "", message: "Must be an object" }],
		});

		expect(stderr.output()).toContain("  (root): Must be an object");
	});

	it("does not list issues in human mode when details has no issues array", () => {
		const stderr = createWritable();

		writeError(stderr.stream, false, "Server error", { code: 500 });

		expect(stderr.output()).toBe("Error: Server error\n");
	});
});
