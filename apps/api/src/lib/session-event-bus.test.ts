import { createRuntimeEventFactory } from "@meridian/contracts/runtime-events";
import { describe, expect, it } from "vitest";
import { createSessionEventBus } from "./session-event-bus";

function createTestEvent(sessionId: string) {
	const factory = createRuntimeEventFactory({
		sessionId,
		turnId: "turn-1",
	});
	return factory.create("assistant.delta", { delta: "hello" });
}

describe("SessionEventBus", () => {
	it("delivers a published event to a subscriber", async () => {
		const bus = createSessionEventBus();
		const event = createTestEvent("session-1");

		const stream = bus.subscribe("session-1");
		bus.publish("session-1", event);

		const reader = stream.getReader();
		const { value } = await reader.read();
		reader.releaseLock();

		expect(value).toEqual(event);
	});

	it("replays events published after lastEventId on reconnect", async () => {
		const bus = createSessionEventBus();
		const event1 = createTestEvent("session-1");
		const event2 = createTestEvent("session-1");

		// First subscriber sees both events
		const stream1 = bus.subscribe("session-1");
		bus.publish("session-1", event1);
		bus.publish("session-1", event2);

		const reader1 = stream1.getReader();
		const { value: first } = await reader1.read();
		await reader1.read(); // consume second
		reader1.releaseLock();

		// Reconnect after first event — should replay only event2
		const stream2 = bus.subscribe("session-1", {
			lastEventId: first!.id,
		});
		const reader2 = stream2.getReader();
		const { value: replayed } = await reader2.read();
		reader2.releaseLock();

		expect(replayed).toEqual(event2);
	});

	it("evicts oldest events when buffer exceeds max size", async () => {
		const bus = createSessionEventBus({ maxHistoryPerSession: 2 });
		const event1 = createTestEvent("session-1");
		const event2 = createTestEvent("session-1");
		const event3 = createTestEvent("session-1");

		bus.publish("session-1", event1);
		bus.publish("session-1", event2);
		bus.publish("session-1", event3);

		// event1 was evicted, so replaying from event2 should yield event3
		const stream = bus.subscribe("session-1", { lastEventId: event2.id });
		const reader = stream.getReader();
		const { value } = await reader.read();
		reader.releaseLock();

		expect(value).toEqual(event3);

		// Replaying from event1 should yield nothing (it was evicted)
		const stream2 = bus.subscribe("session-1", {
			lastEventId: event1.id,
		});
		bus.publish("session-1", createTestEvent("session-1"));
		const reader2 = stream2.getReader();
		const { value: freshEvent } = await reader2.read();
		reader2.releaseLock();

		// Should get the newly published event, not event2/event3
		// (because event1 wasn't found in buffer, no replay happened)
		expect(freshEvent).not.toEqual(event2);
		expect(freshEvent).not.toEqual(event3);
	});

	it("does not deliver events from other sessions", async () => {
		const bus = createSessionEventBus();
		const ownEvent = createTestEvent("session-1");
		const otherEvent = createTestEvent("session-2");

		const stream = bus.subscribe("session-1");
		bus.publish("session-2", otherEvent);
		bus.publish("session-1", ownEvent);

		const reader = stream.getReader();
		const { value } = await reader.read();
		reader.releaseLock();

		expect(value).toEqual(ownEvent);
	});
});
