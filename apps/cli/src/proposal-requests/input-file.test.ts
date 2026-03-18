import { describe, expect, it } from "vitest";
import { InputFileParseError, InputFileReadError } from "@/errors";
import type { ResolvedCliDependencies } from "@/runtime";
import { readProposalRequestInput } from "./input-file";

function createDependencies(
	fileSystem: Partial<ResolvedCliDependencies["fileSystem"]>,
) {
	return {
		fileSystem: {
			mkdir: async () => {},
			readFile: async () => "",
			rm: async () => {},
			unlink: async () => {},
			writeFile: async () => {},
			...fileSystem,
		},
	} as ResolvedCliDependencies;
}

describe("readProposalRequestInput", () => {
	it("parses valid JSON from the file", async () => {
		const deps = createDependencies({
			readFile: async () => JSON.stringify({ postcode: "AA1 1AA" }),
		});

		const result = await readProposalRequestInput(deps, "input.json");

		expect(result).toEqual({ postcode: "AA1 1AA" });
	});

	it("throws InputFileReadError when file does not exist", async () => {
		const deps = createDependencies({
			readFile: async () => {
				const error = new Error("ENOENT") as NodeJS.ErrnoException;
				error.code = "ENOENT";
				throw error;
			},
		});

		await expect(
			readProposalRequestInput(deps, "missing.json"),
		).rejects.toThrow(InputFileReadError);
	});

	it("throws InputFileParseError when file contains invalid JSON", async () => {
		const deps = createDependencies({
			readFile: async () => "{not valid json",
		});

		await expect(readProposalRequestInput(deps, "bad.json")).rejects.toThrow(
			InputFileParseError,
		);
	});

	it("includes the file path in InputFileReadError", async () => {
		const deps = createDependencies({
			readFile: async () => {
				const error = new Error("ENOENT") as NodeJS.ErrnoException;
				error.code = "ENOENT";
				throw error;
			},
		});

		await expect(
			readProposalRequestInput(deps, "/path/to/missing.json"),
		).rejects.toThrow('Input file "/path/to/missing.json" could not be read.');
	});

	it("includes the file path in InputFileParseError", async () => {
		const deps = createDependencies({
			readFile: async () => "not json",
		});

		await expect(
			readProposalRequestInput(deps, "/path/to/bad.json"),
		).rejects.toThrow('Input file "/path/to/bad.json" contains invalid JSON.');
	});

	it("re-throws unexpected read errors", async () => {
		const deps = createDependencies({
			readFile: async () => {
				throw new Error("disk failure");
			},
		});

		await expect(readProposalRequestInput(deps, "input.json")).rejects.toThrow(
			"disk failure",
		);
	});
});
