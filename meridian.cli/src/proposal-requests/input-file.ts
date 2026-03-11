import {
	InputFileParseError,
	InputFileReadError,
	InvalidStoredStateError,
} from "../errors.js";
import type { ResolvedCliDependencies } from "../runtime.js";

export async function readProposalRequestInput(
	dependencies: ResolvedCliDependencies,
	file: string,
) {
	try {
		const rawInput = await dependencies.fileSystem.readFile(file, "utf8");

		try {
			return JSON.parse(rawInput) as unknown;
		} catch (error) {
			if (error instanceof SyntaxError) {
				throw new InputFileParseError(file);
			}

			throw error;
		}
	} catch (error) {
		if (
			error instanceof InputFileParseError ||
			error instanceof InvalidStoredStateError
		) {
			throw error;
		}

		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			throw new InputFileReadError(file);
		}

		throw error;
	}
}
