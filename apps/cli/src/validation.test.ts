import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validateProposalRequestInput } from "./validation";

const testSchema = z.object({
	name: z.string(),
	age: z.number(),
});

describe("validateProposalRequestInput", () => {
	it("returns empty array for valid input", () => {
		const issues = validateProposalRequestInput(
			{ name: "Jane", age: 30 },
			testSchema,
		);

		expect(issues).toEqual([]);
	});

	it("returns an issue when input is not an object", () => {
		const issues = validateProposalRequestInput("not an object", testSchema);

		expect(issues).toEqual([
			{ path: "", message: "Input file must contain a JSON object" },
		]);
	});

	it("returns an issue when input is an array", () => {
		const issues = validateProposalRequestInput([1, 2, 3], testSchema);

		expect(issues).toEqual([
			{ path: "", message: "Input file must contain a JSON object" },
		]);
	});

	it("returns an issue when input is null", () => {
		const issues = validateProposalRequestInput(null, testSchema);

		expect(issues).toEqual([
			{ path: "", message: "Input file must contain a JSON object" },
		]);
	});

	it("returns validation issues with dot-joined paths", () => {
		const issues = validateProposalRequestInput({}, testSchema);

		expect(issues).toEqual([
			{ path: "name", message: expect.any(String) },
			{ path: "age", message: expect.any(String) },
		]);
	});

	it("joins nested paths with dots", () => {
		const nestedSchema = z.object({
			data: z.object({
				postcode: z.string(),
			}),
		});

		const issues = validateProposalRequestInput({ data: {} }, nestedSchema);

		expect(issues).toEqual([
			{ path: "data.postcode", message: expect.any(String) },
		]);
	});
});
