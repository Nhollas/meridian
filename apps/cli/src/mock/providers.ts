import type { ProductOffering, ResultRecord } from "../store/data.js";

type MockResultContext = {
	customerId: string;
	product: string;
	proposalId: string;
	sessionId: string;
	version: string;
};

function createBroadbandOffering(input: {
	brandCode: string;
	brandName: string;
	contractMonths: number;
	monthlyPrice: number;
	providerName: string;
	setupFee: number;
	speed: string;
}): ProductOffering {
	return {
		brandName: input.brandName,
		brandCode: input.brandCode,
		providerName: input.providerName,
		pricing: {
			paymentOptions: [
				{
					type: "Installment",
					totalCost: input.monthlyPrice * input.contractMonths + input.setupFee,
					installmentDetails: {
						deposit: input.setupFee,
						numberOfPayments: input.contractMonths,
						installmentAmount: input.monthlyPrice,
						apr: null,
					},
				},
			],
		},
		metadata: {
			speed: input.speed,
			contractMonths: input.contractMonths,
			setupFee: input.setupFee,
		},
	};
}

function createTravelOffering(input: {
	brandCode: string;
	brandName: string;
	coverLevel: string;
	excess: number;
	price: number;
	providerName: string;
}): ProductOffering {
	return {
		brandName: input.brandName,
		brandCode: input.brandCode,
		providerName: input.providerName,
		pricing: {
			paymentOptions: [
				{
					type: "OneTime",
					totalCost: input.price,
					installmentDetails: null,
				},
			],
		},
		metadata: {
			coverLevel: input.coverLevel,
			excess: input.excess,
		},
	};
}

export function getMockResults(context: MockResultContext): ResultRecord {
	if (context.product === "travel") {
		return {
			id: `${context.proposalId}-result`,
			product: context.product,
			version: context.version,
			proposalId: context.proposalId,
			sessionId: context.sessionId,
			customerId: context.customerId,
			metadata: {},
			offerings: [
				createTravelOffering({
					providerName: "Aviva",
					brandName: "Single Trip Standard",
					brandCode: "aviva-single-trip-standard",
					coverLevel: "single",
					price: 12.5,
					excess: 100,
				}),
				createTravelOffering({
					providerName: "Admiral",
					brandName: "Annual Gold",
					brandCode: "admiral-annual-gold",
					coverLevel: "annual",
					price: 18.75,
					excess: 75,
				}),
			],
		};
	}

	return {
		id: `${context.proposalId}-result`,
		product: context.product,
		version: context.version,
		proposalId: context.proposalId,
		sessionId: context.sessionId,
		customerId: context.customerId,
		metadata: {},
		offerings: [
			createBroadbandOffering({
				providerName: "BT",
				brandName: "Full Fibre 2",
				brandCode: "bt-full-fibre-2",
				speed: "73Mbps",
				monthlyPrice: 32.99,
				contractMonths: 24,
				setupFee: 0,
			}),
			createBroadbandOffering({
				providerName: "Sky",
				brandName: "Superfast 80",
				brandCode: "sky-superfast-80",
				speed: "80Mbps",
				monthlyPrice: 33,
				contractMonths: 18,
				setupFee: 0,
			}),
			createBroadbandOffering({
				providerName: "Vodafone",
				brandName: "Pro Xtra",
				brandCode: "vodafone-pro-xtra",
				speed: "100Mbps",
				monthlyPrice: 35,
				contractMonths: 24,
				setupFee: 0,
			}),
			createBroadbandOffering({
				providerName: "Plusnet",
				brandName: "Full Fibre 66",
				brandCode: "plusnet-full-fibre-66",
				speed: "66Mbps",
				monthlyPrice: 27.99,
				contractMonths: 24,
				setupFee: 5,
			}),
			createBroadbandOffering({
				providerName: "TalkTalk",
				brandName: "Fibre 65",
				brandCode: "talktalk-fibre-65",
				speed: "67Mbps",
				monthlyPrice: 26,
				contractMonths: 18,
				setupFee: 0,
			}),
		],
	};
}
