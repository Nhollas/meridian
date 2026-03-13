import { z } from "zod";

export type ProductVersion = {
	version: string;
	status: "current" | "deprecated";
};

export type ProductSchema = {
	product: string;
	version: string;
	description: string;
	schema: z.ZodTypeAny;
};

export type ProductDefinition = {
	name: string;
	description: string;
	versions: ProductVersion[];
	schemas: Record<string, ProductSchema>;
};

function buildProposalRequestSchema(
	productSchema: ProductSchema,
): ProductSchema {
	return {
		...productSchema,
		description: `${productSchema.description.replace(/ data schema$/, "")} proposal request input schema`,
		schema: z.object({
			emailAddress: z
				.string()
				.email("Must be a valid email address")
				.describe("Email address for the customer requesting the comparison"),
			data: productSchema.schema.describe(
				`Comparison input data for ${productSchema.product}`,
			),
		}),
	};
}

const broadbandSchema: ProductSchema = {
	product: "broadband",
	version: "1.0",
	description: "Broadband comparison data schema",
	schema: z.object({
		postcode: z
			.string()
			.describe("UK postcode where the broadband service is needed"),
		currentProvider: z
			.string()
			.optional()
			.describe("Current broadband provider, if any"),
		currentSpeed: z
			.string()
			.optional()
			.describe("Current broadband speed, e.g. '36Mbps'"),
		preferences: z
			.object({
				minSpeed: z
					.string()
					.optional()
					.describe("Minimum acceptable speed, e.g. '50Mbps'"),
				maxMonthlyCost: z
					.number()
					.optional()
					.describe("Maximum monthly cost in GBP"),
				contractLength: z
					.enum(["12", "18", "24", "any"])
					.optional()
					.describe("Preferred contract length in months, or 'any'"),
			})
			.optional(),
	}),
};

const travelSchema: ProductSchema = {
	product: "travel",
	version: "1.0",
	description: "Travel insurance comparison data schema",
	schema: z.object({
		destination: z.string().describe("Country being visited"),
		departureDate: z.string().describe("Departure date in YYYY-MM-DD format"),
		returnDate: z.string().describe("Return date in YYYY-MM-DD format"),
		coverLevel: z
			.enum(["single", "annual", "backpacker"])
			.optional()
			.describe("Preferred travel insurance cover level"),
		travellers: z.object({
			adults: z.number().describe("Number of adults travelling"),
			children: z.number().optional().describe("Number of children travelling"),
		}),
	}),
};

const catalogue: ProductDefinition[] = [
	{
		name: "broadband",
		description: "Compare broadband deals by speed, price, and contract length",
		versions: [{ version: "1.0", status: "current" }],
		schemas: {
			"1.0": broadbandSchema,
		},
	},
	{
		name: "travel",
		description:
			"Compare travel insurance policies by destination, cover level, and trip type",
		versions: [{ version: "1.0", status: "current" }],
		schemas: {
			"1.0": travelSchema,
		},
	},
];

export function listProducts() {
	return catalogue.map(({ schemas: _schemas, ...product }) => product);
}

export function getProduct(productName: string) {
	return catalogue.find((product) => product.name === productName);
}

export function getProductSchema(productName: string, version: string) {
	return getProduct(productName)?.schemas[version];
}

export function getProposalRequestSchema(productName: string, version: string) {
	const productSchema = getProductSchema(productName, version);
	return productSchema === undefined
		? undefined
		: buildProposalRequestSchema(productSchema);
}
