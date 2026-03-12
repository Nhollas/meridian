import { join } from "node:path";
import { z } from "zod";
import { InvalidStoredStateError } from "@/errors";
import type { FileSystem } from "@/runtime";

const proposalRequestRecordSchema = z.object({
	created_at: z.string(),
	data: z.record(z.string(), z.unknown()),
	emailAddress: z.string(),
	product: z.string(),
	version: z.string(),
});

const proposalRecordSchema = z.object({
	created_at: z.string(),
	product: z.string(),
	proposal_request: z.string(),
	status: z.literal("completed"),
	version: z.string(),
});

const resultMetadataSchema = z.record(z.string(), z.unknown());

const paymentTypeSchema = z.enum(["Annual", "OneTime", "Installment"]);

const installmentDetailsSchema = z.object({
	deposit: z.number(),
	numberOfPayments: z.number().int(),
	installmentAmount: z.number(),
	apr: z.number().nullable(),
});

const paymentOptionSchema = z.object({
	type: paymentTypeSchema,
	totalCost: z.number(),
	installmentDetails: installmentDetailsSchema.nullable(),
});

const pricingSchema = z.object({
	paymentOptions: z.array(paymentOptionSchema).min(1),
});

const productOfferingSchema = z.object({
	brandName: z.string(),
	brandCode: z.string(),
	providerName: z.string(),
	pricing: pricingSchema,
	metadata: resultMetadataSchema,
});

const resultRecordSchema = z.object({
	id: z.string(),
	product: z.string(),
	version: z.string(),
	proposalId: z.string(),
	sessionId: z.string(),
	customerId: z.string(),
	metadata: resultMetadataSchema,
	offerings: z.array(productOfferingSchema).min(1),
});

const dataStoreSchema = z.object({
	proposal_requests: z.record(z.string(), proposalRequestRecordSchema),
	proposals: z.record(z.string(), proposalRecordSchema),
	results: z.record(z.string(), resultRecordSchema),
});

export type ProposalRequestRecord = z.infer<typeof proposalRequestRecordSchema>;
export type ProposalRecord = z.infer<typeof proposalRecordSchema>;
export type ResultMetadata = z.infer<typeof resultMetadataSchema>;
export type PaymentType = z.infer<typeof paymentTypeSchema>;
export type InstallmentDetails = z.infer<typeof installmentDetailsSchema>;
export type PaymentOption = z.infer<typeof paymentOptionSchema>;
export type Pricing = z.infer<typeof pricingSchema>;
export type ProductOffering = z.infer<typeof productOfferingSchema>;
export type ResultRecord = z.infer<typeof resultRecordSchema>;
export type DataStore = z.infer<typeof dataStoreSchema>;

const EMPTY_DATA_STORE: DataStore = {
	proposal_requests: {},
	proposals: {},
	results: {},
};

function getDataPath(homeDirectory: string) {
	return join(homeDirectory, ".meridian", "data.json");
}

export async function readDataStore(
	fileSystem: FileSystem,
	homeDirectory: string,
): Promise<DataStore> {
	try {
		const contents = await fileSystem.readFile(
			getDataPath(homeDirectory),
			"utf8",
		);
		const payload = JSON.parse(contents) as unknown;
		const parsed = dataStoreSchema.safeParse(payload);
		if (!parsed.success) {
			throw new InvalidStoredStateError("data");
		}
		return parsed.data;
	} catch (error) {
		const errorCode = (error as NodeJS.ErrnoException).code;
		if (errorCode === "ENOENT") {
			return structuredClone(EMPTY_DATA_STORE);
		}

		if (error instanceof SyntaxError || errorCode === "EISDIR") {
			throw new InvalidStoredStateError("data");
		}

		throw error;
	}
}

export async function writeDataStore(
	fileSystem: FileSystem,
	homeDirectory: string,
	dataStore: DataStore,
) {
	await fileSystem.mkdir(join(homeDirectory, ".meridian"), { recursive: true });
	await fileSystem.writeFile(
		getDataPath(homeDirectory),
		JSON.stringify(dataStore, null, 2),
	);
}
