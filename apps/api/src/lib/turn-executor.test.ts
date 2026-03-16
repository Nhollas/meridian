import { describe, expect, it } from "vitest";
import type {
	AgentProgressEvent,
	AgentTurnResult,
} from "@/lib/agent/contracts";
import type { AgentService } from "@/lib/agent/service";
import type { SessionStreamRegistry } from "@/lib/session-stream-registry";
import { createCollectingRegistry } from "../../tests/support/collecting-registry";
import {
	executeTurn,
	type SessionTurnQueue,
	triggerSystemTurn,
} from "./turn-executor";

function createStubAgentService(
	handler: (params: {
		message: string;
		sessionId: string;
		onEvent?: (event: AgentProgressEvent) => void | Promise<void>;
	}) => Promise<AgentTurnResult>,
): AgentService {
	return { streamConversation: handler };
}

function createNoopRegistry(): SessionStreamRegistry {
	return {
		register() {},
		unregister() {},
		async writeEvent() {},
	};
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

describe("session turn queue", () => {
	it("serializes turns on the same session", async () => {
		const executionOrder: string[] = [];
		const queue: SessionTurnQueue = new Map();

		let resolveTurn1!: () => void;
		const turn1Block = new Promise<void>((r) => {
			resolveTurn1 = r;
		});

		const service = createStubAgentService(async ({ message }) => {
			executionOrder.push(`${message}:start`);
			if (message === "turn-1") await turn1Block;
			executionOrder.push(`${message}:end`);
			return { content: message, toolCalls: [] };
		});

		const registry = createNoopRegistry();

		executeTurn({
			agentService: service,
			message: "turn-1",
			registry,
			sessionId: "session-1",
			sessionTurnQueue: queue,
			turnId: "t1",
		});

		// Give turn 1 a tick to start
		await new Promise((r) => setTimeout(r, 10));

		executeTurn({
			agentService: service,
			message: "turn-2",
			registry,
			sessionId: "session-1",
			sessionTurnQueue: queue,
			turnId: "t2",
		});

		// Turn 2 should NOT have started yet
		await new Promise((r) => setTimeout(r, 10));
		expect(executionOrder).toEqual(["turn-1:start"]);

		// Unblock turn 1 and wait for both to finish
		resolveTurn1();
		await queue.get("session-1");

		expect(executionOrder).toEqual([
			"turn-1:start",
			"turn-1:end",
			"turn-2:start",
			"turn-2:end",
		]);
	});

	it("does not block turns on different sessions", async () => {
		const executionOrder: string[] = [];
		const queue: SessionTurnQueue = new Map();

		let resolveA!: () => void;
		const blockA = new Promise<void>((r) => {
			resolveA = r;
		});

		const service = createStubAgentService(async ({ message }) => {
			executionOrder.push(`${message}:start`);
			if (message === "session-a") await blockA;
			executionOrder.push(`${message}:end`);
			return { content: message, toolCalls: [] };
		});

		const registry = createNoopRegistry();

		executeTurn({
			agentService: service,
			message: "session-a",
			registry,
			sessionId: "session-a",
			sessionTurnQueue: queue,
			turnId: "t1",
		});

		// Give A a tick to start
		await new Promise((r) => setTimeout(r, 10));

		executeTurn({
			agentService: service,
			message: "session-b",
			registry,
			sessionId: "session-b",
			sessionTurnQueue: queue,
			turnId: "t2",
		});

		// Wait for B to finish
		await queue.get("session-b");

		expect(executionOrder).toEqual([
			"session-a:start",
			"session-b:start",
			"session-b:end",
		]);

		resolveA();
		await queue.get("session-a");

		expect(executionOrder).toEqual([
			"session-a:start",
			"session-b:start",
			"session-b:end",
			"session-a:end",
		]);
	});

	it("cleans up queue entry after last turn completes", async () => {
		const queue: SessionTurnQueue = new Map();
		const service = createStubAgentService(async () => {
			return { content: "done", toolCalls: [] };
		});
		const registry = createNoopRegistry();

		executeTurn({
			agentService: service,
			message: "hi",
			registry,
			sessionId: "session-1",
			sessionTurnQueue: queue,
			turnId: "t1",
		});

		// Wait for the turn and cleanup
		await new Promise((r) => setTimeout(r, 50));
		expect(queue.has("session-1")).toBe(false);
	});

	it("system turn queues behind in-flight user turn", async () => {
		const executionOrder: string[] = [];
		const queue: SessionTurnQueue = new Map();

		let resolveUserTurn!: () => void;
		const userTurnBlock = new Promise<void>((r) => {
			resolveUserTurn = r;
		});

		const service = createStubAgentService(async ({ message }) => {
			executionOrder.push(`${message}:start`);
			if (message === "user-message") await userTurnBlock;
			executionOrder.push(`${message}:end`);
			return { content: message, toolCalls: [] };
		});

		const registry = createNoopRegistry();

		executeTurn({
			agentService: service,
			message: "user-message",
			registry,
			sessionId: "session-1",
			sessionTurnQueue: queue,
			turnId: "user-t1",
		});

		// Give user turn a tick to start
		await new Promise((r) => setTimeout(r, 10));

		// System turn fires while user turn is in-flight
		triggerSystemTurn({
			agentService: service,
			createTurnId: () => "system-t1",
			message: "background-complete",
			registry,
			sessionId: "session-1",
			sessionTurnQueue: queue,
		});

		await new Promise((r) => setTimeout(r, 10));
		expect(executionOrder).toEqual(["user-message:start"]);

		resolveUserTurn();
		await queue.get("session-1");

		expect(executionOrder).toEqual([
			"user-message:start",
			"user-message:end",
			"background-complete:start",
			"background-complete:end",
		]);
	});
});
