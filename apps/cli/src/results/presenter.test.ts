import { describe, expect, it } from "vitest";
import type { ProductOffering, ResultRecord } from "@/store/data";
import {
	formatOfferingRow,
	formatResultsHeader,
	formatSortLabel,
	sortResultOfferings,
} from "./presenter";

function createOffering(
	overrides: Partial<ProductOffering> & {
		totalCost: number;
		paymentType?: "OneTime" | "Installment";
		installmentAmount?: number;
	},
): ProductOffering {
	const {
		totalCost,
		paymentType = "OneTime",
		installmentAmount,
		...rest
	} = overrides;

	return {
		brandName: "Standard Plan",
		brandCode: "std-plan",
		providerName: "Acme",
		pricing: {
			paymentOptions: [
				{
					type: paymentType,
					totalCost,
					installmentDetails:
						paymentType === "Installment"
							? {
									deposit: 0,
									numberOfPayments: 12,
									installmentAmount: installmentAmount ?? totalCost,
									apr: null,
								}
							: null,
				},
			],
		},
		metadata: {},
		...rest,
	};
}

function createResult(
	offerings: ProductOffering[],
	product = "broadband",
): ResultRecord {
	return {
		id: "result-1",
		product,
		version: "1.0",
		proposalId: "prop-1",
		sessionId: "session-1",
		customerId: "test@example.com",
		metadata: {},
		offerings,
	};
}

describe("formatSortLabel", () => {
	it("returns human-readable label for each sort order", () => {
		expect(formatSortLabel("price-asc")).toBe("price (lowest first)");
		expect(formatSortLabel("price-desc")).toBe("price (highest first)");
		expect(formatSortLabel("provider")).toBe("provider (A\u2013Z)");
	});
});

describe("sortResultOfferings", () => {
	const cheap = createOffering({
		providerName: "Bolt",
		totalCost: 10,
	});
	const expensive = createOffering({
		providerName: "Acme",
		totalCost: 50,
	});

	it("sorts by price ascending", () => {
		const result = createResult([expensive, cheap]);
		const sorted = sortResultOfferings(result, "price-asc");
		const providers = sorted.offerings.map((o) => o.providerName);
		expect(providers).toEqual(["Bolt", "Acme"]);
	});

	it("sorts by price descending", () => {
		const result = createResult([cheap, expensive]);
		const sorted = sortResultOfferings(result, "price-desc");
		const providers = sorted.offerings.map((o) => o.providerName);
		expect(providers).toEqual(["Acme", "Bolt"]);
	});

	it("sorts by provider name alphabetically", () => {
		const result = createResult([expensive, cheap]);
		const sorted = sortResultOfferings(result, "provider");
		const providers = sorted.offerings.map((o) => o.providerName);
		expect(providers).toEqual(["Acme", "Bolt"]);
	});

	it("uses installment amount for price sorting when available", () => {
		const lowMonthly = createOffering({
			providerName: "Bolt",
			totalCost: 600,
			paymentType: "Installment",
			installmentAmount: 25,
		});
		const highMonthly = createOffering({
			providerName: "Acme",
			totalCost: 400,
			paymentType: "Installment",
			installmentAmount: 40,
		});

		const result = createResult([highMonthly, lowMonthly]);
		const sorted = sortResultOfferings(result, "price-asc");
		const providers = sorted.offerings.map((o) => o.providerName);
		expect(providers).toEqual(["Bolt", "Acme"]);
	});

	it("does not mutate the original result", () => {
		const result = createResult([expensive, cheap]);
		sortResultOfferings(result, "price-asc");
		const providers = result.offerings.map((o) => o.providerName);
		expect(providers).toEqual(["Acme", "Bolt"]);
	});
});

describe("formatResultsHeader", () => {
	it("returns broadband header with speed and contract columns", () => {
		const lines = formatResultsHeader("broadband", "prop-1");
		expect(lines[0]).toBe("Results for proposal prop-1 (broadband)");
		expect(lines[2]).toContain("Speed");
		expect(lines[2]).toContain("Contract");
		expect(lines[2]).toContain("Setup");
	});

	it("returns travel header with cover and excess columns", () => {
		const lines = formatResultsHeader("travel", "prop-2");
		expect(lines[0]).toBe("Results for proposal prop-2 (travel)");
		expect(lines[2]).toContain("Cover");
		expect(lines[2]).toContain("Excess");
	});

	it("returns car header with cover, excess, and breakdown columns", () => {
		const lines = formatResultsHeader("car", "prop-3");
		expect(lines[0]).toBe("Results for proposal prop-3 (car)");
		expect(lines[2]).toContain("Cover");
		expect(lines[2]).toContain("Excess");
		expect(lines[2]).toContain("Breakdown");
	});

	it("falls back to broadband header for unknown products", () => {
		const lines = formatResultsHeader("pet", "prop-4");
		expect(lines[2]).toContain("Speed");
	});
});

describe("formatOfferingRow", () => {
	describe("broadband", () => {
		it("formats installment price with /mo suffix", () => {
			const offering = createOffering({
				providerName: "Acme",
				brandName: "Fibre 100",
				totalCost: 468,
				paymentType: "Installment",
				installmentAmount: 26,
				metadata: { speed: "100Mbps", contractMonths: 18, setupFee: 0 },
			});

			const row = formatOfferingRow("broadband", offering);
			expect(row).toContain("Acme");
			expect(row).toContain("Fibre 100");
			expect(row).toContain("100Mbps");
			expect(row).toContain("£26.00/mo");
			expect(row).toContain("18 months");
			expect(row).toContain("Free");
		});

		it("formats non-zero setup fee as currency", () => {
			const offering = createOffering({
				providerName: "Bolt",
				brandName: "Basic 30",
				totalCost: 360,
				paymentType: "Installment",
				installmentAmount: 20,
				metadata: { speed: "30Mbps", contractMonths: 12, setupFee: 9.99 },
			});

			const row = formatOfferingRow("broadband", offering);
			expect(row).toContain("£9.99");
		});
	});

	describe("travel", () => {
		it("formats one-time price without suffix", () => {
			const offering = createOffering({
				providerName: "Zenith",
				brandName: "Annual Gold",
				totalCost: 18.75,
				metadata: { coverLevel: "annual", excess: 75 },
			});

			const row = formatOfferingRow("travel", offering);
			expect(row).toContain("Zenith");
			expect(row).toContain("Annual Gold");
			expect(row).toContain("annual");
			expect(row).toContain("£18.75");
			expect(row).toContain("£75.00");
		});

		it("shows Free for zero excess", () => {
			const offering = createOffering({
				providerName: "Bolt",
				brandName: "No Excess Plan",
				totalCost: 25,
				metadata: { coverLevel: "single", excess: 0 },
			});

			const row = formatOfferingRow("travel", offering);
			expect(row).toContain("Free");
		});
	});

	describe("car", () => {
		it("formats comprehensive cover with breakdown", () => {
			const offering = createOffering({
				providerName: "Acme",
				brandName: "Full Cover",
				totalCost: 540,
				paymentType: "Installment",
				installmentAmount: 45,
				metadata: {
					coverType: "comprehensive",
					excess: 250,
					breakdownCover: true,
				},
			});

			const row = formatOfferingRow("car", offering);
			expect(row).toContain("Acme");
			expect(row).toContain("Full Cover");
			expect(row).toContain("Comprehensive");
			expect(row).toContain("£45.00/mo");
			expect(row).toContain("£250.00");
			expect(row).toContain("Yes");
		});

		it("formats third party fire and theft cover type", () => {
			const offering = createOffering({
				providerName: "Bolt",
				brandName: "TPFT Basic",
				totalCost: 320,
				metadata: {
					coverType: "thirdPartyFireTheft",
					excess: 500,
					breakdownCover: false,
				},
			});

			const row = formatOfferingRow("car", offering);
			expect(row).toContain("Third Party F&T");
			expect(row).toContain("No");
		});

		it("formats one-time car payment with /yr suffix", () => {
			const offering = createOffering({
				providerName: "Zenith",
				brandName: "Pay Annual",
				totalCost: 400,
				metadata: {
					coverType: "thirdParty",
					excess: 300,
					breakdownCover: false,
				},
			});

			const row = formatOfferingRow("car", offering);
			expect(row).toContain("£400.00/yr");
			expect(row).toContain("Third Party");
		});
	});
});
