import { describe, expect, it, vi } from "vitest";
import type {
	AgentProgressEvent,
	AgentToolCall,
	AgentTurnResult,
} from "@/lib/agent/contracts";
import { createSessionEventBus } from "@/lib/session-event-bus";
import { createChatRequest } from "../../tests/support/chat-route";
import { createChatRoute } from "./chat";

const completedToolCall: AgentToolCall = {
	id: "tool-1",
	input: '{"path":"offers.json"}',
	name: "read_file",
	output: '{"offers":2}',
	state: "completed",
};

function createTestRoute() {
	const eventBus = createSessionEventBus();
	const streamConversation = vi.fn();

	const handler = createChatRoute({
		createAgentService: () => ({ streamConversation }),
		createTurnId: () => "turn-1",
		eventBus,
		getRuntime: () => ({}) as never,
	});

	return { handler, eventBus, streamConversation };
}

async function collectEvents(
	eventBus: ReturnType<typeof createSessionEventBus>,
	sessionId: string,
) {
	const { stream } = eventBus.subscribe(sessionId);
	const reader = stream.getReader();
	const events = [];
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		events.push(value);
		if (value.type === "turn.completed" || value.type === "turn.failed") {
			break;
		}
	}
	reader.releaseLock();
	return events;
}

describe("POST /api/chat", () => {
	it("returns a validation error when the session id is invalid", async () => {
		const { handler } = createTestRoute();

		const response = await handler(
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
		const { handler } = createTestRoute();

		const response = await handler(
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

	it("returns 202 with turnId and publishes events to the event bus", async () => {
		const { handler, eventBus, streamConversation } = createTestRoute();

		streamConversation.mockImplementation(
			async ({
				message,
				onEvent,
				sessionId,
			}: {
				message: string;
				onEvent?: (event: AgentProgressEvent) => Promise<void>;
				sessionId: string;
			}): Promise<AgentTurnResult> => {
				expect(sessionId).toBe("session-123");
				expect(message).toBe("Find me an offer");

				await onEvent?.({
					type: "text-delta",
					text: "Working through the options...",
				});
				await onEvent?.({
					type: "tool-call",
					toolCall: completedToolCall,
				});

				return {
					content: "I found 2 offers worth comparing.",
					toolCalls: [completedToolCall],
				};
			},
		);

		const eventsPromise = collectEvents(eventBus, "session-123");
		const response = await handler(
			createChatRequest({
				message: "Find me an offer",
				sessionId: "session-123",
				turnId: "client-turn-1",
			}),
		);

		expect(response.status).toBe(202);
		await expect(response.json()).resolves.toEqual({
			turnId: "client-turn-1",
		});

		const events = await eventsPromise;
		expect(events).toEqual([
			expect.objectContaining({
				sequence: 1,
				type: "assistant.delta",
				payload: {
					delta: "Working through the options...",
				},
			}),
			expect.objectContaining({
				sequence: 2,
				type: "tool.completed",
				payload: {
					toolCall: {
						id: "tool-1",
						input: '{"path":"offers.json"}',
						name: "read_file",
						output: '{"offers":2}',
					},
				},
			}),
			expect.objectContaining({
				sequence: 3,
				type: "turn.completed",
				payload: {
					content: "I found 2 offers worth comparing.",
					toolCalls: [completedToolCall],
				},
			}),
		]);
	});

	it("emits an error event when the agent service throws before streaming progress", async () => {
		const { handler, eventBus, streamConversation } = createTestRoute();
		streamConversation.mockRejectedValue(new Error("agent exploded"));

		const eventsPromise = collectEvents(eventBus, "session-123");
		await handler(
			createChatRequest({
				message: "Find me an offer",
				sessionId: "session-123",
			}),
		);
		const events = await eventsPromise;

		expect(events).toEqual([
			expect.objectContaining({
				sequence: 1,
				type: "turn.failed",
				payload: {
					error: "agent exploded",
				},
			}),
		]);
	});

	it("falls back to a non-empty error message when the thrown error message is empty", async () => {
		const { handler, eventBus, streamConversation } = createTestRoute();
		streamConversation.mockRejectedValue(new Error(""));

		const eventsPromise = collectEvents(eventBus, "session-123");
		await handler(
			createChatRequest({
				message: "Find me an offer",
				sessionId: "session-123",
			}),
		);
		const events = await eventsPromise;

		expect(events).toEqual([
			expect.objectContaining({
				sequence: 1,
				type: "turn.failed",
				payload: {
					error: "Unknown error",
				},
			}),
		]);
	});

	it("streams tool state transitions with unique IDs in turn.completed", async () => {
		const { handler, eventBus, streamConversation } = createTestRoute();

		const runningToolCall: AgentToolCall = {
			id: "tool-1",
			input: '{"path":"offers.json"}',
			name: "read_file",
			output: "",
			state: "running",
		};

		streamConversation.mockImplementation(
			async ({
				onEvent,
			}: {
				onEvent?: (event: AgentProgressEvent) => Promise<void>;
			}): Promise<AgentTurnResult> => {
				await onEvent?.({ type: "tool-call", toolCall: runningToolCall });
				await onEvent?.({ type: "tool-call", toolCall: completedToolCall });

				return {
					content: "Done.",
					toolCalls: [completedToolCall],
				};
			},
		);

		const eventsPromise = collectEvents(eventBus, "session-123");
		await handler(
			createChatRequest({
				message: "Read offers",
				sessionId: "session-123",
			}),
		);
		const events = await eventsPromise;

		expect(events[0]).toMatchObject({
			sequence: 1,
			type: "tool.started",
			payload: {
				toolCall: { id: "tool-1", name: "read_file" },
			},
		});
		expect(events[1]).toMatchObject({
			sequence: 2,
			type: "tool.completed",
			payload: {
				toolCall: { id: "tool-1", name: "read_file" },
			},
		});

		const turnCompleted = events.find((e) => e.type === "turn.completed");
		if (turnCompleted?.type !== "turn.completed")
			throw new Error("expected turn.completed event");
		const toolCallIds = turnCompleted.payload.toolCalls.map((tc) => tc.id);
		const uniqueIds = new Set(toolCallIds);
		expect(uniqueIds.size).toBe(toolCallIds.length);
	});

	it("emits partial progress as a completed turn when the agent fails mid-stream", async () => {
		const { handler, eventBus, streamConversation } = createTestRoute();

		streamConversation.mockImplementation(
			async ({
				onEvent,
			}: {
				onEvent?: (event: AgentProgressEvent) => Promise<void>;
			}) => {
				await onEvent?.({
					type: "text-delta",
					text: "Authentication started. Open the login URL in your browser.",
				});

				throw new Error("device flow requires user interaction");
			},
		);

		const eventsPromise = collectEvents(eventBus, "session-123");
		await handler(
			createChatRequest({
				message: "Start login",
				sessionId: "session-123",
			}),
		);
		const events = await eventsPromise;

		expect(events).toEqual([
			expect.objectContaining({
				sequence: 1,
				type: "assistant.delta",
				payload: {
					delta: "Authentication started. Open the login URL in your browser.",
				},
			}),
			expect.objectContaining({
				sequence: 2,
				type: "turn.completed",
				payload: {
					content:
						"Authentication started. Open the login URL in your browser.",
					toolCalls: [],
				},
			}),
		]);
	});
});
