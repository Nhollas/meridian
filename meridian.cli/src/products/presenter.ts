import type { ProductDefinition } from "../catalogue/registry.js";

export function formatProductsList(
	products: Omit<ProductDefinition, "schemas">[],
) {
	return [
		"Available products",
		"",
		"  Product     Description                                                    Version",
		...products.map(
			(product) =>
				`  ${product.name.padEnd(11)} ${product.description.padEnd(62)} ${product.versions
					.map((version) => `${version.version} (${version.status})`)
					.join(", ")}`,
		),
		"",
		`${products.length} products available`,
	];
}
