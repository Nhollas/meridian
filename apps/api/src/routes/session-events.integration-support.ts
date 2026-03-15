import { Hono } from "hono";
import type { SessionEventBus } from "@/lib/session-event-bus";
import { createSessionEventsRoute } from "./session-events";

export function createTestSessionEventsApp({
	eventBus,
	heartbeatIntervalMs,
}: {
	eventBus: SessionEventBus;
	heartbeatIntervalMs?: number;
}) {
	const app = new Hono();
	const handleSessionEvents = createSessionEventsRoute({
		eventBus,
		heartbeatIntervalMs,
	});
	app.get("/api/sessions/:id/events", (c) => handleSessionEvents(c));
	return app;
}
