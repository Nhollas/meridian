import { describe, expect, it } from "vitest";
import { formatProductsList } from "./presenter";

describe("formatProductsList", () => {
	it("formats products with header, rows, and count", () => {
		const lines = formatProductsList([
			{
				name: "broadband",
				description: "Compare broadband deals",
				versions: [{ version: "1.0", status: "current" }],
			},
			{
				name: "travel",
				description: "Compare travel insurance",
				versions: [{ version: "1.0", status: "current" }],
			},
		]);

		expect(lines[0]).toBe("Available products");
		expect(lines[1]).toBe("");
		expect(lines[2]).toContain("Product");
		expect(lines[2]).toContain("Description");
		expect(lines[2]).toContain("Version");
		expect(lines[3]).toContain("broadband");
		expect(lines[3]).toContain("Compare broadband deals");
		expect(lines[3]).toContain("1.0 (current)");
		expect(lines[4]).toContain("travel");
		expect(lines.at(-1)).toBe("2 products available");
	});

	it("lists multiple versions comma-separated", () => {
		const lines = formatProductsList([
			{
				name: "broadband",
				description: "Compare broadband deals",
				versions: [
					{ version: "1.0", status: "deprecated" },
					{ version: "2.0", status: "current" },
				],
			},
		]);

		expect(lines[3]).toContain("1.0 (deprecated), 2.0 (current)");
	});

	it("returns correct count for empty list", () => {
		const lines = formatProductsList([]);

		expect(lines.at(-1)).toBe("0 products available");
	});
});
