import { listProducts } from "@/catalogue/registry";
import { writeJson, writeLines } from "@/output";
import type { ResolvedCliDependencies } from "@/runtime";
import { formatProductsList } from "./presenter";

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
