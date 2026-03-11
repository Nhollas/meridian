import { requireAuthentication } from "../auth/session.js";
import { type JsonOption, writeError } from "../cli/command-helpers.js";
import { writeJson, writeLines } from "../output.js";
import type { ResolvedCliDependencies } from "../runtime.js";
import { readDataStore } from "../store/data.js";
import { formatResultsTable, sortResultOfferings } from "./presenter.js";

export type ResultsGetOptions = JsonOption & {
	proposal: string;
};

export async function handleResultsGet(
	dependencies: ResolvedCliDependencies,
	options: ResultsGetOptions,
	jsonMode: boolean,
) {
	const { homeDirectory, stderr, stdout } = dependencies;
	const credentials = await requireAuthentication(dependencies);

	if (credentials === null) {
		writeError(
			stderr,
			jsonMode,
			'Not authenticated. Run "meridian auth login" first.',
		);
		return 1;
	}

	const dataStore = await readDataStore(dependencies.fileSystem, homeDirectory);
	const proposal = dataStore.proposals[options.proposal];

	if (proposal === undefined) {
		writeError(stderr, jsonMode, `Proposal "${options.proposal}" not found.`);
		return 1;
	}

	const result = dataStore.results[options.proposal];

	if (result === undefined) {
		writeError(
			stderr,
			jsonMode,
			`Result for proposal "${options.proposal}" not found.`,
		);
		return 1;
	}

	const sortedResult = sortResultOfferings(result);

	if (jsonMode) {
		writeJson(stdout, sortedResult);
		return 0;
	}

	writeLines(
		stdout,
		formatResultsTable(proposal.product, options.proposal, sortedResult),
	);
	return 0;
}
