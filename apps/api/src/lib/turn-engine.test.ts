import { describe, expect, it } from "vitest";
import type {
	AgentProgressEvent,
	AgentTurnResult,
} from "@/lib/agent/contracts";
import type { AgentService } from "@/lib/agent/service";
import { createCollectingRegistry } from "../../tests/support/collecting-registry";
import { createTurnEngine } from "./turn-engine";

function createStubAgentService(
	handler: (params: {
		message: string;
		sessionId: string;
		onEvent?: (event: AgentProgressEvent) => void | Promise<void>;
	}) => Promise<AgentTurnResult>,
): AgentService {
	return { streamConversation: handler };
}

describe("TurnEngine", () => {
	it("streams events to the registry and emits turn.completed", async () => {
		const agentService = createStubAgentService(async ({ onEvent }) => {
			await onEvent?.({ type: "text-delta", text: "Hello" });
			return { content: "Hello", toolCalls: [] };
		});
		const { registry, collectTurnEvents } = createCollectingRegistry();

		const eventsPromise = collectTurnEvents("session-1");

		const engine = createTurnEngine({
			createAgentService: () => agentService,
			getRuntime: () => ({}) as never,
			registry,
		});

		engine.submit({ sessionId: "session-1", message: "hi", turnId: "turn-1" });

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

		const engine = createTurnEngine({
			createAgentService: () => agentService,
			getRuntime: () => ({}) as never,
			registry,
		});

		engine.submit({ sessionId: "session-1", message: "hi", turnId: "turn-1" });

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

		const engine = createTurnEngine({
			createAgentService: () => agentService,
			getRuntime: () => ({}) as never,
			registry,
		});

		engine.submit({ sessionId: "session-1", message: "hi", turnId: "turn-1" });

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

	it("generates a turnId when none is provided", async () => {
		const agentService = createStubAgentService(async ({ onEvent }) => {
			await onEvent?.({ type: "text-delta", text: "Notification response" });
			return { content: "Notification response", toolCalls: [] };
		});
		const { registry, collectTurnEvents } = createCollectingRegistry();

		const eventsPromise = collectTurnEvents("session-1");

		const engine = createTurnEngine({
			createAgentService: () => agentService,
			createTurnId: () => "system-turn-1",
			getRuntime: () => ({}) as never,
			registry,
		});

		const turnId = engine.submit({
			sessionId: "session-1",
			message: "OAuth callback: user authenticated",
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

	it("serializes turns on the same session", async () => {
		const executionOrder: string[] = [];

		let resolveTurn1!: () => void;
		const turn1Block = new Promise<void>((r) => {
			resolveTurn1 = r;
		});

		const engine = createTurnEngine({
			createAgentService: () =>
				createStubAgentService(async ({ message }) => {
					executionOrder.push(`${message}:start`);
					if (message === "turn-1") await turn1Block;
					executionOrder.push(`${message}:end`);
					return { content: message, toolCalls: [] };
				}),
			getRuntime: () => ({}) as never,
			registry: {
				register() {},
				unregister() {},
				async writeEvent() {},
			},
		});

		engine.submit({ sessionId: "session-1", message: "turn-1", turnId: "t1" });

		// Give turn 1 a tick to start
		await new Promise((r) => setTimeout(r, 10));

		engine.submit({ sessionId: "session-1", message: "turn-2", turnId: "t2" });

		// Turn 2 should NOT have started yet
		await new Promise((r) => setTimeout(r, 10));
		expect(executionOrder).toEqual(["turn-1:start"]);

		// Unblock turn 1 and wait for both to finish
		resolveTurn1();
		await new Promise((r) => setTimeout(r, 50));

		expect(executionOrder).toEqual([
			"turn-1:start",
			"turn-1:end",
			"turn-2:start",
			"turn-2:end",
		]);
	});

	it("does not block turns on different sessions", async () => {
		const executionOrder: string[] = [];

		let resolveA!: () => void;
		const blockA = new Promise<void>((r) => {
			resolveA = r;
		});

		const engine = createTurnEngine({
			createAgentService: () =>
				createStubAgentService(async ({ message }) => {
					executionOrder.push(`${message}:start`);
					if (message === "session-a") await blockA;
					executionOrder.push(`${message}:end`);
					return { content: message, toolCalls: [] };
				}),
			getRuntime: () => ({}) as never,
			registry: {
				register() {},
				unregister() {},
				async writeEvent() {},
			},
		});

		engine.submit({
			sessionId: "session-a",
			message: "session-a",
			turnId: "t1",
		});

		// Give A a tick to start
		await new Promise((r) => setTimeout(r, 10));

		engine.submit({
			sessionId: "session-b",
			message: "session-b",
			turnId: "t2",
		});

		// Wait for B to finish
		await new Promise((r) => setTimeout(r, 50));

		expect(executionOrder).toEqual([
			"session-a:start",
			"session-b:start",
			"session-b:end",
		]);

		resolveA();
		await new Promise((r) => setTimeout(r, 50));

		expect(executionOrder).toEqual([
			"session-a:start",
			"session-b:start",
			"session-b:end",
			"session-a:end",
		]);
	});

	it("system turn queues behind in-flight user turn", async () => {
		const executionOrder: string[] = [];

		let resolveUserTurn!: () => void;
		const userTurnBlock = new Promise<void>((r) => {
			resolveUserTurn = r;
		});

		const engine = createTurnEngine({
			createAgentService: () =>
				createStubAgentService(async ({ message }) => {
					executionOrder.push(`${message}:start`);
					if (message === "user-message") await userTurnBlock;
					executionOrder.push(`${message}:end`);
					return { content: message, toolCalls: [] };
				}),
			createTurnId: () => "system-t1",
			getRuntime: () => ({}) as never,
			registry: {
				register() {},
				unregister() {},
				async writeEvent() {},
			},
		});

		engine.submit({
			sessionId: "session-1",
			message: "user-message",
			turnId: "user-t1",
		});

		// Give user turn a tick to start
		await new Promise((r) => setTimeout(r, 10));

		// System turn fires while user turn is in-flight (no turnId → generated)
		engine.submit({
			sessionId: "session-1",
			message: "background-complete",
		});

		await new Promise((r) => setTimeout(r, 10));
		expect(executionOrder).toEqual(["user-message:start"]);

		resolveUserTurn();
		await new Promise((r) => setTimeout(r, 50));

		expect(executionOrder).toEqual([
			"user-message:start",
			"user-message:end",
			"background-complete:start",
			"background-complete:end",
		]);
	});
});
