import { requireAuthentication } from "@/auth/session";
import { type JsonOption, writeError } from "@/command-helpers";
import { getMockResults } from "@/mock-providers";
import { writeJson, writeLines } from "@/output";
import type { ResolvedCliDependencies } from "@/runtime";
import { readDataStore, writeDataStore } from "@/store/data";

export type ProposalCreateOptions = JsonOption & {
	proposalRequest: string;
};

export async function handleProposalsCreate(
	dependencies: ResolvedCliDependencies,
	options: ProposalCreateOptions,
	jsonMode: boolean,
) {
	const { homeDirectory, now, randomId, stderr, stdout } = dependencies;
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
	const proposalRequest = dataStore.proposalRequests[options.proposalRequest];

	if (proposalRequest === undefined) {
		writeError(
			stderr,
			jsonMode,
			`Proposal request "${options.proposalRequest}" not found.`,
		);
		return 1;
	}

	const id = randomId("prop");
	const createdAt = now().toISOString();
	const result = getMockResults({
		product: proposalRequest.product,
		proposalId: id,
		version: proposalRequest.version,
		customerId: proposalRequest.emailAddress,
		sessionId: `session-${options.proposalRequest}`,
	});

	dataStore.proposals[id] = {
		proposalRequestId: options.proposalRequest,
		product: proposalRequest.product,
		version: proposalRequest.version,
		status: "completed",
		createdAt,
	};
	dataStore.results[id] = result;

	await writeDataStore(dependencies.fileSystem, homeDirectory, dataStore);

	const payload = {
		id,
		proposalRequestId: options.proposalRequest,
		product: proposalRequest.product,
		version: proposalRequest.version,
		status: "completed" as const,
		createdAt,
	};

	if (jsonMode) {
		writeJson(stdout, payload);
		return 0;
	}

	writeLines(stdout, [
		"Proposal created",
		"",
		`ID: ${id}`,
		`Proposal request: ${options.proposalRequest}`,
		`Product: ${proposalRequest.product}`,
		`Version: ${proposalRequest.version}`,
		"Status: completed",
	]);
	return 0;
}
