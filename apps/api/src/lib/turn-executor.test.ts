import { describe, expect, it } from "vitest";
import type {
	AgentProgressEvent,
	AgentTurnResult,
} from "@/lib/agent/contracts";
import type { AgentService } from "@/lib/agent/service";
import { createCollectingRegistry } from "../../tests/support/collecting-registry";
import { executeTurn, triggerSystemTurn } from "./turn-executor";

function createStubAgentService(
	handler: (params: {
		message: string;
		sessionId: string;
		onEvent?: (event: AgentProgressEvent) => void | Promise<void>;
	}) => Promise<AgentTurnResult>,
): AgentService {
	return { streamConversation: handler };
}

describe("executeTurn", () => {
	it("streams events to the registry and emits turn.completed", async () => {
		const agentService = createStubAgentService(async ({ onEvent }) => {
			await onEvent?.({ type: "text-delta", text: "Hello" });
			return { content: "Hello", toolCalls: [] };
		});
		const { registry, collectTurnEvents } = createCollectingRegistry();

		const eventsPromise = collectTurnEvents("session-1");

		executeTurn({
			agentService,
			message: "hi",
			registry,
			sessionId: "session-1",
			turnId: "turn-1",
		});

		const events = await eventsPromise;

		expect(events).toEqual([
			expect.objectContaining({
				type: "assistant.delta",
				payload: { delta: "Hello" },
			}),
			expect.objectContaining({
				type: "turn.completed",
				payload: { content: "Hello", toolCalls: [] },
			}),
		]);
	});

	it("emits turn.failed on error", async () => {
		const agentService = createStubAgentService(async () => {
			throw new Error("Something broke");
		});
		const { registry, collectTurnEvents } = createCollectingRegistry();

		const eventsPromise = collectTurnEvents("session-1");

		executeTurn({
			agentService,
			message: "hi",
			registry,
			sessionId: "session-1",
			turnId: "turn-1",
		});

		const events = await eventsPromise;

		expect(events).toEqual([
			expect.objectContaining({
				type: "turn.failed",
				payload: { error: "Something broke" },
			}),
		]);
	});

	it("emits turn.completed with partial content on mid-stream error", async () => {
		const agentService = createStubAgentService(async ({ onEvent }) => {
			await onEvent?.({ type: "text-delta", text: "Partial response" });
			throw new Error("Stream broke");
		});
		const { registry, collectTurnEvents } = createCollectingRegistry();

		const eventsPromise = collectTurnEvents("session-1");

		executeTurn({
			agentService,
			message: "hi",
			registry,
			sessionId: "session-1",
			turnId: "turn-1",
		});

		const events = await eventsPromise;

		expect(events).toEqual([
			expect.objectContaining({
				type: "assistant.delta",
				payload: { delta: "Partial response" },
			}),
			expect.objectContaining({
				type: "turn.completed",
				payload: { content: "Partial response", toolCalls: [] },
			}),
		]);
	});
});

describe("triggerSystemTurn", () => {
	it("returns a turnId and executes the turn", async () => {
		const agentService = createStubAgentService(async ({ onEvent }) => {
			await onEvent?.({ type: "text-delta", text: "Notification response" });
			return { content: "Notification response", toolCalls: [] };
		});
		const { registry, collectTurnEvents } = createCollectingRegistry();

		const eventsPromise = collectTurnEvents("session-1");

		const turnId = triggerSystemTurn({
			agentService,
			createTurnId: () => "system-turn-1",
			message: "OAuth callback: user authenticated",
			registry,
			sessionId: "session-1",
		});

		expect(turnId).toBe("system-turn-1");

		const events = await eventsPromise;

		expect(events).toEqual([
			expect.objectContaining({
				type: "assistant.delta",
				turnId: "system-turn-1",
				sessionId: "session-1",
			}),
			expect.objectContaining({
				type: "turn.completed",
				turnId: "system-turn-1",
				sessionId: "session-1",
			}),
		]);
	});
});
