import { describe, expect, it } from "vitest";
import { createWritable } from "../tests/support/streams";
import { getOutputMode, writeJson, writeJsonLine, writeLines } from "./output";

describe("getOutputMode", () => {
	it("returns json when explicitly requested", () => {
		const stdout = createWritable(true);
		expect(getOutputMode(stdout.stream, true)).toBe("json");
	});

	it("returns json when stdout is not a TTY", () => {
		const stdout = createWritable(false);
		expect(getOutputMode(stdout.stream, false)).toBe("json");
	});

	it("returns human when stdout is a TTY and json not requested", () => {
		const stdout = createWritable(true);
		expect(getOutputMode(stdout.stream, false)).toBe("human");
	});
});

describe("writeJson", () => {
	it("writes pretty-printed JSON with trailing newline", () => {
		const stdout = createWritable();

		writeJson(stdout.stream, { name: "test" });

		expect(stdout.output()).toBe('{\n  "name": "test"\n}\n');
	});
});

describe("writeJsonLine", () => {
	it("writes compact JSON with trailing newline", () => {
		const stdout = createWritable();

		writeJsonLine(stdout.stream, { name: "test" });

		expect(stdout.output()).toBe('{"name":"test"}\n');
	});
});

describe("writeLines", () => {
	it("joins lines with newlines and adds trailing newline", () => {
		const stdout = createWritable();

		writeLines(stdout.stream, ["line 1", "line 2", "line 3"]);

		expect(stdout.output()).toBe("line 1\nline 2\nline 3\n");
	});
});
