import type { HttpResponseResolver } from "msw";

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
