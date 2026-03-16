import { describe, expect, it, vi } from "vitest";
import type { TurnEngine } from "@/lib/turn-engine";
import { createChatRequest } from "../../tests/support/chat-route";
import { createCollectingRegistry } from "../../tests/support/collecting-registry";

function createStubEngine(overrides: Partial<TurnEngine> = {}): TurnEngine {
	const { registry } = createCollectingRegistry();
	return {
		submit: vi.fn(() => "stub-turn-id"),
		registry,
		...overrides,
	};
}

describe("POST /api/chat", () => {
	it("returns a validation error when the session id is invalid", async () => {
		const { createChatRoute } = await import("@/routes/chat");
		const engine = createStubEngine();
		const route = createChatRoute({ engine });

		const response = await route(
			createChatRequest({
				message: "Hello",
				sessionId: "bad session id",
			}),
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			errors: ["Missing or invalid sessionId."],
		});
	});

	it("returns a validation error when the message is empty", async () => {
		const { createChatRoute } = await import("@/routes/chat");
		const engine = createStubEngine();
		const route = createChatRoute({ engine });

		const response = await route(
			createChatRequest({
				message: "   ",
				sessionId: "session-123",
			}),
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			errors: ["Missing or invalid message."],
		});
	});

	it("returns 202 with turnId and submits to the engine", async () => {
		const { createChatRoute } = await import("@/routes/chat");
		const submit = vi.fn(() => "test-turn-1");
		const engine = createStubEngine({ submit });
		const route = createChatRoute({
			createTurnId: () => "test-turn-1",
			engine,
		});

		const response = await route(
			createChatRequest({
				message: "Find me an offer",
				sessionId: "session-123",
			}),
		);

		expect(response.status).toBe(202);
		await expect(response.json()).resolves.toEqual({
			turnId: "test-turn-1",
		});

		expect(submit).toHaveBeenCalledWith({
			sessionId: "session-123",
			message: "Find me an offer",
			turnId: "test-turn-1",
		});
	});
});
