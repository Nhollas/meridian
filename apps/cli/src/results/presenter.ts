import type {
	PaymentOption,
	ProductOffering,
	ResultRecord,
} from "@/store/data";

export type SortOrder = "price-asc" | "price-desc" | "provider";

export const sortOrders: SortOrder[] = ["price-asc", "price-desc", "provider"];

function formatCurrency(amount: number) {
	return amount === 0 ? "Free" : `£${amount.toFixed(2)}`;
}

function getPrimaryPaymentOption(offering: ProductOffering): PaymentOption {
	const option = offering.pricing.paymentOptions[0];
	if (option === undefined) {
		throw new Error("Offering is missing a payment option.");
	}

	return option;
}

function getDisplayPriceValue(offering: ProductOffering) {
	const option = getPrimaryPaymentOption(offering);
	return option.type === "Installment"
		? (option.installmentDetails?.installmentAmount ?? option.totalCost)
		: option.totalCost;
}

function formatOfferingPrice(offering: ProductOffering) {
	const option = getPrimaryPaymentOption(offering);
	if (option.type === "Installment") {
		const amount =
			option.installmentDetails?.installmentAmount ?? option.totalCost;
		return `£${amount.toFixed(2)}/mo`;
	}

	return `£${option.totalCost.toFixed(2)}`;
}

function getNumberMetadata(
	offering: ProductOffering,
	key: string,
): number | undefined {
	const value = offering.metadata[key];
	return typeof value === "number" ? value : undefined;
}

function getStringMetadata(
	offering: ProductOffering,
	key: string,
): string | undefined {
	const value = offering.metadata[key];
	return typeof value === "string" ? value : undefined;
}

const offeringSortComparators: Record<
	SortOrder,
	(a: ProductOffering, b: ProductOffering) => number
> = {
	"price-asc": (a, b) => getDisplayPriceValue(a) - getDisplayPriceValue(b),
	"price-desc": (a, b) => getDisplayPriceValue(b) - getDisplayPriceValue(a),
	provider: (a, b) => a.providerName.localeCompare(b.providerName),
};

export function sortResultOfferings(
	result: ResultRecord,
	sort: SortOrder,
): ResultRecord {
	return {
		...result,
		offerings: [...result.offerings].sort(offeringSortComparators[sort]),
	};
}

const sortLabels: Record<SortOrder, string> = {
	"price-asc": "price (lowest first)",
	"price-desc": "price (highest first)",
	provider: "provider (A–Z)",
};

export function formatSortLabel(sort: SortOrder) {
	return sortLabels[sort];
}

export function formatResultsHeader(product: string, proposalId: string) {
	const columnHeader =
		product === "travel"
			? "  Provider    Plan                   Cover       Price       Excess"
			: "  Provider    Plan             Speed     Price       Contract   Setup";

	return [`Results for proposal ${proposalId} (${product})`, "", columnHeader];
}

export function formatOfferingRow(product: string, offering: ProductOffering) {
	if (product === "travel") {
		return `  ${offering.providerName.padEnd(11)} ${offering.brandName.padEnd(22)} ${String(getStringMetadata(offering, "coverLevel") ?? "").padEnd(11)} ${formatOfferingPrice(offering).padEnd(11)} ${formatCurrency(getNumberMetadata(offering, "excess") ?? 0)}`;
	}

	return `  ${offering.providerName.padEnd(11)} ${offering.brandName.padEnd(16)} ${String(getStringMetadata(offering, "speed") ?? "").padEnd(9)} ${formatOfferingPrice(offering).padEnd(11)} ${`${Number(getNumberMetadata(offering, "contractMonths") ?? 0)} months`.padEnd(10)} ${formatCurrency(getNumberMetadata(offering, "setupFee") ?? 0)}`;
}
