import { z } from "zod";

import { getProduct, getProposalRequestSchema } from "@/catalogue/registry";
import { writeError } from "@/cli/command-helpers";
import { writeJson } from "@/output";
import type { ResolvedCliDependencies } from "@/runtime";

export type ProductSchemaOptions = {
	product: string;
	version: string;
};

export async function handleProductSchemasGet(
	dependencies: ResolvedCliDependencies,
	options: ProductSchemaOptions,
	jsonMode: boolean,
) {
	const { stderr, stdout } = dependencies;
	const schema = getProposalRequestSchema(options.product, options.version);

	if (schema === undefined) {
		const availableVersions = getProduct(options.product)?.versions.map(
			(item) => item.version,
		);
		writeError(
			stderr,
			jsonMode,
			`No schema found for product "${options.product}" version "${options.version}".`,
			availableVersions === undefined
				? undefined
				: { available_versions: availableVersions },
		);
		if (!jsonMode && availableVersions !== undefined) {
			stderr.write(`Available versions: ${availableVersions.join(", ")}\n`);
		}
		return 1;
	}

	const jsonSchema = z.toJSONSchema(schema.schema);
	writeJson(stdout, jsonSchema);
	return 0;
}
