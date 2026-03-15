import { createRuntimeEventFactory } from "@meridian/contracts/runtime-events";
import { describe, expect, it } from "vitest";
import { createSessionStreamRegistry } from "./session-stream-registry";

function createTestEventFactory() {
	return createRuntimeEventFactory({
		createId: () => "evt-1",
		now: () => "2026-03-10T12:00:00.000Z",
		sessionId: "session-123",
		turnId: "turn-1",
	});
}

describe("SessionStreamRegistry", () => {
	it("delivers events to a registered writer", async () => {
		const registry = createSessionStreamRegistry();
		const collected: unknown[] = [];
		const factory = createTestEventFactory();

		registry.register("session-123", {
			writeSSE: async (message) => {
				collected.push(message);
			},
		});

		const event = factory.create("assistant.delta", { delta: "hello" });
		await registry.writeEvent("session-123", event);

		expect(collected).toEqual([
			{
				data: JSON.stringify(event),
				id: event.id,
			},
		]);
	});

	it("is a no-op when no writer is registered for the session", async () => {
		const registry = createSessionStreamRegistry();
		const factory = createTestEventFactory();

		const event = factory.create("assistant.delta", { delta: "hello" });
		await expect(
			registry.writeEvent("unknown-session", event),
		).resolves.toBeUndefined();
	});

	it("stops delivering events after unregister", async () => {
		const registry = createSessionStreamRegistry();
		const collected: unknown[] = [];
		const factory = createTestEventFactory();

		registry.register("session-123", {
			writeSSE: async (message) => {
				collected.push(message);
			},
		});

		registry.unregister("session-123");

		const event = factory.create("assistant.delta", { delta: "hello" });
		await registry.writeEvent("session-123", event);

		expect(collected).toEqual([]);
	});
});
