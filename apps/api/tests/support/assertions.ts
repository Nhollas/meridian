import { expect } from "vitest";

export function assertDefined<T>(
	value: T,
	message?: string,
): asserts value is NonNullable<T> {
	expect(value, message).toBeDefined();
}
