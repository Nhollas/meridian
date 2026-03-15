import type { ProductOffering, ResultRecord } from "@/store/data";

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
				createTravelOffering({
					providerName: "AXA",
					brandName: "Comprehensive Plus",
					brandCode: "axa-comprehensive-plus",
					coverLevel: "annual",
					price: 24.0,
					excess: 50,
				}),
				createTravelOffering({
					providerName: "Direct Line",
					brandName: "Essential Cover",
					brandCode: "direct-line-essential",
					coverLevel: "single",
					price: 9.99,
					excess: 150,
				}),
				createTravelOffering({
					providerName: "LV=",
					brandName: "Family Annual",
					brandCode: "lv-family-annual",
					coverLevel: "annual",
					price: 32.5,
					excess: 50,
				}),
				createTravelOffering({
					providerName: "Churchill",
					brandName: "Single Trip Basic",
					brandCode: "churchill-single-trip-basic",
					coverLevel: "single",
					price: 7.99,
					excess: 200,
				}),
				createTravelOffering({
					providerName: "Post Office",
					brandName: "Premier Annual",
					brandCode: "post-office-premier-annual",
					coverLevel: "annual",
					price: 29.0,
					excess: 75,
				}),
				createTravelOffering({
					providerName: "Saga",
					brandName: "Classic Cover",
					brandCode: "saga-classic-cover",
					coverLevel: "single",
					price: 15.0,
					excess: 100,
				}),
				createTravelOffering({
					providerName: "Staysure",
					brandName: "Comprehensive",
					brandCode: "staysure-comprehensive",
					coverLevel: "annual",
					price: 22.0,
					excess: 60,
				}),
				createTravelOffering({
					providerName: "Allianz",
					brandName: "Single Trip Gold",
					brandCode: "allianz-single-trip-gold",
					coverLevel: "single",
					price: 14.25,
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
			createBroadbandOffering({
				providerName: "Virgin Media",
				brandName: "M350",
				brandCode: "virgin-media-m350",
				speed: "362Mbps",
				monthlyPrice: 40,
				contractMonths: 18,
				setupFee: 0,
			}),
			createBroadbandOffering({
				providerName: "EE",
				brandName: "Fibre Max 300",
				brandCode: "ee-fibre-max-300",
				speed: "300Mbps",
				monthlyPrice: 39.99,
				contractMonths: 24,
				setupFee: 0,
			}),
			createBroadbandOffering({
				providerName: "Shell Energy",
				brandName: "Superfast Fibre Plus",
				brandCode: "shell-energy-superfast-plus",
				speed: "67Mbps",
				monthlyPrice: 24.99,
				contractMonths: 18,
				setupFee: 0,
			}),
			createBroadbandOffering({
				providerName: "NOW",
				brandName: "Super Fibre",
				brandCode: "now-super-fibre",
				speed: "63Mbps",
				monthlyPrice: 25,
				contractMonths: 12,
				setupFee: 5,
			}),
			createBroadbandOffering({
				providerName: "Hyperoptic",
				brandName: "Fast 150",
				brandCode: "hyperoptic-fast-150",
				speed: "150Mbps",
				monthlyPrice: 30,
				contractMonths: 24,
				setupFee: 0,
			}),
		],
	};
}
