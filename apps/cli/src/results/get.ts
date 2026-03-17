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

type TimedOffering = {
	offering: ProductOffering;
	arrivalMs: number;
};

function assignRandomArrivals(offerings: ProductOffering[]): TimedOffering[] {
	return offerings
		.map((offering) => ({
			offering,
			arrivalMs: Math.round(Math.random() * 20_000),
		}))
		.sort((a, b) => a.arrivalMs - b.arrivalMs);
}

async function streamTimedOfferings(
	timedOfferings: TimedOffering[],
	sleep: (ms: number) => Promise<void>,
	onOffering: (offering: ProductOffering) => void,
) {
	let elapsed = 0;
	for (const { offering, arrivalMs } of timedOfferings) {
		const delta = arrivalMs - elapsed;
		if (delta > 0) {
			await sleep(delta);
		}
		elapsed = arrivalMs;
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
	const timedOfferings = assignRandomArrivals(sortedResult.offerings);

	if (jsonMode) {
		writeJsonLine(stdout, {
			status: "pending",
			proposalId: options.proposal,
		});

		await streamTimedOfferings(timedOfferings, sleep, (offering) => {
			writeJsonLine(stdout, { status: "offering", offering });
		});

		writeJsonLine(stdout, {
			status: "complete",
			offerings: sortedResult.offerings,
		});

		return 0;
	}

	writeLines(stdout, formatResultsHeader(proposal.product, options.proposal));

	await streamTimedOfferings(timedOfferings, sleep, (offering) => {
		writeLines(stdout, [formatOfferingRow(proposal.product, offering)]);
	});

	writeLines(stdout, [
		"",
		`${timedOfferings.length} offering${timedOfferings.length === 1 ? "" : "s"} sorted by ${formatSortLabel(options.sort)}`,
	]);

	return 0;
}
