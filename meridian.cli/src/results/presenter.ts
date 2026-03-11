import type {
	PaymentOption,
	ProductOffering,
	ResultRecord,
} from "../store/data.js";

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

function formatOfferingCount(count: number) {
	return `${count} offering${count === 1 ? "" : "s"} sorted by price (lowest first)`;
}

export function sortResultOfferings(result: ResultRecord): ResultRecord {
	return {
		...result,
		offerings: [...result.offerings].sort(
			(left, right) => getDisplayPriceValue(left) - getDisplayPriceValue(right),
		),
	};
}

export function formatResultsTable(
	product: string,
	proposalId: string,
	result: ResultRecord,
) {
	const offerings = [...result.offerings].sort(
		(left, right) => getDisplayPriceValue(left) - getDisplayPriceValue(right),
	);

	if (product === "travel") {
		return [
			`Results for proposal ${proposalId} (${product})`,
			"",
			"  Provider    Plan                   Cover       Price       Excess",
			...offerings.map(
				(offering) =>
					`  ${offering.providerName.padEnd(11)} ${offering.brandName.padEnd(22)} ${String(getStringMetadata(offering, "coverLevel") ?? "").padEnd(11)} ${formatOfferingPrice(offering).padEnd(11)} ${formatCurrency(getNumberMetadata(offering, "excess") ?? 0)}`,
			),
			"",
			formatOfferingCount(offerings.length),
		];
	}

	return [
		`Results for proposal ${proposalId} (${product})`,
		"",
		"  Provider    Plan             Speed     Price       Contract   Setup",
		...offerings.map(
			(offering) =>
				`  ${offering.providerName.padEnd(11)} ${offering.brandName.padEnd(16)} ${String(getStringMetadata(offering, "speed") ?? "").padEnd(9)} ${formatOfferingPrice(offering).padEnd(11)} ${`${Number(getNumberMetadata(offering, "contractMonths") ?? 0)} months`.padEnd(10)} ${formatCurrency(getNumberMetadata(offering, "setupFee") ?? 0)}`,
		),
		"",
		formatOfferingCount(offerings.length),
	];
}
