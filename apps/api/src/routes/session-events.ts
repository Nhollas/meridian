import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { SessionStreamRegistry } from "@/lib/session-stream-registry";

export function createSessionEventsRoute({
	registry,
}: {
	registry: SessionStreamRegistry;
}) {
	return (c: Context) => {
		const sessionId = c.req.param("id") as string;

		return streamSSE(c, async (stream) => {
			registry.register(sessionId, stream);

			stream.onAbort(() => {
				registry.unregister(sessionId);
			});

			while (true) {
				await stream.sleep(30000);
			}
		});
	};
}
