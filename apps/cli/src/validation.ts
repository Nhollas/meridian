import type { z } from "zod";

export type ValidationIssue = {
	message: string;
	path: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateProposalRequestInput(
	input: unknown,
	schema: z.ZodTypeAny,
): ValidationIssue[] {
	if (!isRecord(input)) {
		return [{ path: "", message: "Input file must contain a JSON object" }];
	}

	const result = schema.safeParse(input);
	if (result.success) {
		return [];
	}

	return result.error.issues.map((issue) => ({
		path: issue.path.map(String).join("."),
		message: issue.message,
	}));
}
