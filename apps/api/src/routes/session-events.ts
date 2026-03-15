import {
	type RuntimeEventEnvelope,
	serializeRuntimeEventEnvelope,
} from "@meridian/contracts/runtime-events";
import type { Context } from "hono";
import type { SessionEventBus } from "@/lib/session-event-bus";

const encoder = new TextEncoder();
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;

function formatSSE(event: RuntimeEventEnvelope): string {
	return `id: ${event.id}\ndata: ${serializeRuntimeEventEnvelope(event)}\n\n`;
}

type SessionEventsRouteDependencies = {
	eventBus: SessionEventBus;
	heartbeatIntervalMs?: number | undefined;
};

export function createSessionEventsRoute({
	eventBus,
	heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
}: SessionEventsRouteDependencies) {
	return (c: Context) => {
		const sessionId = c.req.param("id") as string;

		const lastEventId = c.req.header("Last-Event-ID");
		const { stream: subscription, unsubscribe } = eventBus.subscribe(
			sessionId,
			{
				...(lastEventId ? { lastEventId } : {}),
			},
		);
		const reader = subscription.getReader();

		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				const heartbeat = setInterval(() => {
					try {
						controller.enqueue(encoder.encode(": heartbeat\n\n"));
					} catch {
						clearInterval(heartbeat);
					}
				}, heartbeatIntervalMs);

				void (async () => {
					try {
						while (true) {
							const { done, value } = await reader.read();
							if (done) break;
							controller.enqueue(encoder.encode(formatSSE(value)));
						}
					} catch {
						// Stream cancelled
					} finally {
						clearInterval(heartbeat);
						unsubscribe();
						try {
							controller.close();
						} catch {
							// Already closed
						}
					}
				})();
			},
			cancel() {
				unsubscribe();
				reader.cancel();
			},
		});

		return new Response(stream, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache, no-transform",
				Connection: "keep-alive",
			},
		});
	};
}
