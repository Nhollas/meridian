import type { HttpResponseResolver } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

export const mswServer = setupServer();

beforeAll(() => {
	mswServer.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
	mswServer.resetHandlers();
});

afterAll(() => {
	mswServer.close();
});

/**
 * Higher-order resolver that only matches requests whose URL-encoded
 * form body contains exactly the specified parameters.
 *
 * If the body does not match, the handler returns `undefined` so MSW
 * falls through to the next handler (or triggers an unhandled-request
 * error when no handler matches).
 *
 * @see https://mswjs.io/docs/best-practices/custom-request-predicate
 */
export function withFormBody(
	expected: Record<string, string>,
	resolver: HttpResponseResolver,
): HttpResponseResolver {
	return async (args) => {
		const actual = new URLSearchParams(await args.request.clone().text());
		const expectedEntries = Object.entries(expected);

		if (actual.size !== expectedEntries.length) {
			return;
		}

		for (const [key, value] of expectedEntries) {
			if (actual.get(key) !== value) {
				return;
			}
		}

		return resolver(args);
	};
}
