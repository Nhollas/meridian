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
