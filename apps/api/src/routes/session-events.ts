import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { SessionStreamRegistry } from "@/lib/session-stream-registry";

const sessionIdSchema = z
	.string()
	.min(1, "Missing or invalid sessionId.")
	.regex(/^[A-Za-z0-9_-]+$/, "Missing or invalid sessionId.");

export function createSessionEventsRoute({
	registry,
}: {
	registry: SessionStreamRegistry;
}) {
	return (c: Context) => {
		const sessionIdResult = sessionIdSchema.safeParse(c.req.param("id"));

		if (!sessionIdResult.success) {
			const errors = sessionIdResult.error.issues.map((issue) => issue.message);
			return c.json({ errors }, 400);
		}

		const sessionId = sessionIdResult.data;

		return streamSSE(c, async (stream) => {
			registry.register(sessionId, stream);

			stream.onAbort(() => {
				registry.unregister(sessionId);
			});

			// Keep the connection open — without this the callback returns and
			// Hono closes the stream. The 30s sleep doubles as a keepalive ping
			// so proxies/browsers don't time out the connection.
			while (true) {
				await stream.sleep(30000);
			}
		});
	};
}
