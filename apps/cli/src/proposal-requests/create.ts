import { requireAuthentication } from "@/auth/session";
import { getProposalRequestSchema } from "@/catalogue/registry";
import { type JsonOption, writeError } from "@/cli/command-helpers";
import { writeJson, writeLines } from "@/output";
import type { ResolvedCliDependencies } from "@/runtime";
import { readDataStore, writeDataStore } from "@/store/data";
import { validateProposalRequestInput } from "@/validation";
import { readProposalRequestInput } from "./input-file";

export type ProposalRequestCreateOptions = JsonOption & {
	file: string;
	product: string;
	version: string;
};

export async function handleProposalRequestsCreate(
	dependencies: ResolvedCliDependencies,
	options: ProposalRequestCreateOptions,
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

	const productSchema = getProposalRequestSchema(
		options.product,
		options.version,
	);

	if (productSchema === undefined) {
		writeError(
			stderr,
			jsonMode,
			`No schema found for product "${options.product}" version "${options.version}".`,
		);
		return 1;
	}

	const input = await readProposalRequestInput(dependencies, options.file);
	const issues = validateProposalRequestInput(input, productSchema.schema);

	if (issues.length > 0) {
		writeError(stderr, jsonMode, "Validation failed", { issues });
		return 1;
	}

	const parsedInput = input as {
		data: Record<string, unknown>;
		emailAddress: string;
	};
	const dataStore = await readDataStore(dependencies.fileSystem, homeDirectory);
	const id = randomId("pr");
	const createdAt = now().toISOString();

	dataStore.proposal_requests[id] = {
		created_at: createdAt,
		data: parsedInput.data,
		emailAddress: parsedInput.emailAddress,
		product: options.product,
		version: options.version,
	};

	await writeDataStore(dependencies.fileSystem, homeDirectory, dataStore);

	const payload = {
		id,
		product: options.product,
		version: options.version,
		status: "draft",
		created_at: createdAt,
	};

	if (jsonMode) {
		writeJson(stdout, payload);
		return 0;
	}

	writeLines(stdout, [
		"Proposal request created",
		"",
		`ID: ${id}`,
		`Product: ${options.product}`,
		`Version: ${options.version}`,
		`Created: ${createdAt}`,
	]);
	return 0;
}
