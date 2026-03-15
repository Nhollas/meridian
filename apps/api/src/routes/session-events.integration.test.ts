import {
	createRuntimeEventFactory,
	serializeRuntimeEventEnvelope,
} from "@meridian/contracts/runtime-events";
import { describe, expect, it } from "vitest";
import { createSessionEventBus } from "@/lib/session-event-bus";
import { createTestSessionEventsApp } from "./session-events.integration-support";

function createTestEvent(sessionId: string) {
	const factory = createRuntimeEventFactory({
		sessionId,
		turnId: "turn-1",
	});
	return factory.create("assistant.delta", { delta: "hello" });
}

describe("GET /api/sessions/:id/events integration", () => {
	it("streams published events as SSE", async () => {
		const eventBus = createSessionEventBus();
		const app = createTestSessionEventsApp({ eventBus });

		const event = createTestEvent("session-1");

		const response = await app.request("/api/sessions/session-1/events");

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("text/event-stream");

		// Publish an event after the connection is open
		eventBus.publish("session-1", event);

		const reader = response.body!.getReader();
		const decoder = new TextDecoder();
		const { value } = await reader.read();
		reader.releaseLock();

		const text = decoder.decode(value);
		expect(text).toContain(`id: ${event.id}`);
		expect(text).toContain(`data: ${serializeRuntimeEventEnvelope(event)}`);
	});

	it("replays missed events on reconnect using Last-Event-ID", async () => {
		const eventBus = createSessionEventBus();
		const app = createTestSessionEventsApp({ eventBus });

		const event1 = createTestEvent("session-1");
		const event2 = createTestEvent("session-1");

		// Publish both events before any connection
		eventBus.publish("session-1", event1);
		eventBus.publish("session-1", event2);

		// Connect with Last-Event-ID set to event1 — should replay event2
		const response = await app.request("/api/sessions/session-1/events", {
			headers: { "Last-Event-ID": event1.id },
		});

		const reader = response.body!.getReader();
		const decoder = new TextDecoder();
		const { value } = await reader.read();
		reader.releaseLock();

		const text = decoder.decode(value);
		expect(text).toContain(`id: ${event2.id}`);
		expect(text).not.toContain(`id: ${event1.id}`);
	});

	it("sends periodic heartbeat comments", async () => {
		const eventBus = createSessionEventBus();
		const heartbeatIntervalMs = 10;
		const app = createTestSessionEventsApp({
			eventBus,
			heartbeatIntervalMs,
		});

		const response = await app.request("/api/sessions/session-1/events");

		const reader = response.body!.getReader();
		const decoder = new TextDecoder();

		// Wait for a heartbeat to arrive
		const { value } = await reader.read();
		reader.releaseLock();

		const text = decoder.decode(value);
		expect(text).toContain(": heartbeat");
	});
});
