import type { HttpResponseResolver } from "msw";
import { setupWorker } from "msw/browser";

export const browserWorker = setupWorker();

/**
 * Higher-order resolver that only matches requests whose JSON body
 * is a superset of the expected object (subset / partial matching).
 *
 * Falls through (returns `undefined`) when the body does not match,
 * letting MSW try the next handler or raise an unhandled-request error.
 *
 * @see https://mswjs.io/docs/best-practices/custom-request-predicate
 */
export function withJsonBody(
	expected: Record<string, unknown>,
	resolver: HttpResponseResolver,
): HttpResponseResolver {
	return async (args) => {
		const contentType = args.request.headers.get("Content-Type") ?? "";

		if (!contentType.includes("application/json")) {
			return;
		}

		const actual = await args.request.clone().json();

		if (!isSubset(actual, expected)) {
			return;
		}

		return resolver(args);
	};
}

/**
 * Higher-order resolver that only matches requests whose headers
 * satisfy the given predicate function.
 *
 * @see https://mswjs.io/docs/best-practices/custom-request-predicate
 */
export function withHeaders(
	predicate: (headers: Headers) => boolean,
	resolver: HttpResponseResolver,
): HttpResponseResolver {
	return (args) => {
		if (!predicate(args.request.headers)) {
			return;
		}

		return resolver(args);
	};
}

function isSubset(actual: unknown, expected: unknown): boolean {
	if (expected === null || expected === undefined) {
		return actual === expected;
	}

	if (typeof expected !== "object") {
		return actual === expected;
	}

	if (typeof actual !== "object" || actual === null) {
		return false;
	}

	if (Array.isArray(expected)) {
		return (
			Array.isArray(actual) &&
			actual.length === expected.length &&
			expected.every((val, i) => isSubset(actual[i], val))
		);
	}

	return Object.entries(expected as Record<string, unknown>).every(
		([key, value]) => isSubset((actual as Record<string, unknown>)[key], value),
	);
}
