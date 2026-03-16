import { describe, expect, it } from "vitest";
import { upsertById } from "./upsert-by-id";

describe("upsertById", () => {
	it("appends when no matching id exists", () => {
		const items = [{ id: "1", name: "first" }];
		const result = upsertById(items, { id: "2", name: "second" });

		expect(result).toEqual([
			{ id: "1", name: "first" },
			{ id: "2", name: "second" },
		]);
	});

	it("merges when a matching id exists", () => {
		const items = [
			{ id: "1", name: "first", status: "running" },
			{ id: "2", name: "second", status: "running" },
		];
		const result = upsertById(items, {
			id: "1",
			name: "first",
			status: "completed",
		});

		expect(result).toEqual([
			{ id: "1", name: "first", status: "completed" },
			{ id: "2", name: "second", status: "running" },
		]);
	});

	it("does not mutate the original array", () => {
		const items = [{ id: "1", name: "first" }];
		const result = upsertById(items, { id: "1", name: "updated" });

		expect(items[0]?.name).toBe("first");
		expect(result[0]?.name).toBe("updated");
	});

	it("works with an empty array", () => {
		const result = upsertById([], { id: "1", name: "first" });
		expect(result).toEqual([{ id: "1", name: "first" }]);
	});
});
