import { describe, expect, it } from "vitest";
import {
	getProduct,
	getProductSchema,
	listProducts,
} from "@/catalogue/registry";

describe("catalogue registry", () => {
	it("lists the bundled products", () => {
		expect(listProducts()).toEqual([
			{
				name: "broadband",
				description:
					"Compare broadband deals by speed, price, and contract length",
				versions: [{ version: "1.0", status: "current" }],
			},
			{
				name: "travel",
				description:
					"Compare travel insurance policies by destination, cover level, and trip type",
				versions: [{ version: "1.0", status: "current" }],
			},
		]);
	});

	it("looks up products and schemas by name and version", () => {
		expect(getProduct("broadband")?.name).toBe("broadband");
		expect(getProductSchema("broadband", "1.0")).toMatchObject({
			product: "broadband",
			version: "1.0",
			description: "Broadband comparison data schema",
		});
	});
});
