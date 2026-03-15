import { requireAuthentication } from "@/auth/session";
import { type JsonOption, writeError } from "@/command-helpers";
import { writeJsonLine, writeLines } from "@/output";
import type { ResolvedCliDependencies } from "@/runtime";
import type { ProductOffering } from "@/store/data";
import { readDataStore } from "@/store/data";
import {
	formatOfferingRow,
	formatResultsHeader,
	formatSortLabel,
	type SortOrder,
	sortResultOfferings,
} from "./presenter";

export type ResultsGetOptions = JsonOption & {
	proposal: string;
	sort: SortOrder;
};

type DelayedOffering = {
	offering: ProductOffering;
	delayMs: number;
};

function assignRandomDelays(offerings: ProductOffering[]): DelayedOffering[] {
	return offerings.map((offering) => ({
		offering,
		delayMs: Math.round(Math.random() * 20_000),
	}));
}

async function streamDelayedOfferings(
	delayedOfferings: DelayedOffering[],
	sleep: (ms: number) => Promise<void>,
	onOffering: (offering: ProductOffering) => void,
) {
	for (const { offering, delayMs } of delayedOfferings) {
		if (delayMs > 0) {
			await sleep(delayMs);
		}
		onOffering(offering);
	}
}

export async function handleResultsGet(
	dependencies: ResolvedCliDependencies,
	options: ResultsGetOptions,
	jsonMode: boolean,
) {
	const { homeDirectory, sleep, stderr, stdout } = dependencies;
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

	const sortedResult = sortResultOfferings(result, options.sort);
	const delayedOfferings = assignRandomDelays(sortedResult.offerings);

	if (jsonMode) {
		writeJsonLine(stdout, {
			status: "pending",
			proposalId: options.proposal,
		});

		await streamDelayedOfferings(delayedOfferings, sleep, (offering) => {
			writeJsonLine(stdout, { status: "offering", offering });
		});

		writeJsonLine(stdout, {
			status: "complete",
			offerings: sortedResult.offerings,
		});

		return 0;
	}

	writeLines(stdout, formatResultsHeader(proposal.product, options.proposal));

	await streamDelayedOfferings(delayedOfferings, sleep, (offering) => {
		writeLines(stdout, [formatOfferingRow(proposal.product, offering)]);
	});

	writeLines(stdout, [
		"",
		`${delayedOfferings.length} offering${delayedOfferings.length === 1 ? "" : "s"} sorted by ${formatSortLabel(options.sort)}`,
	]);

	return 0;
}
