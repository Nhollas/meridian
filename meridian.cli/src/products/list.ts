import { listProducts } from "../catalogue/registry.js";
import { writeJson, writeLines } from "../output.js";
import type { ResolvedCliDependencies } from "../runtime.js";
import { formatProductsList } from "./presenter.js";

export async function handleProductsList(
	dependencies: ResolvedCliDependencies,
	jsonMode: boolean,
) {
	const { stdout } = dependencies;
	const products = listProducts();

	if (jsonMode) {
		writeJson(stdout, { products });
		return 0;
	}

	writeLines(stdout, formatProductsList(products));
	return 0;
}
