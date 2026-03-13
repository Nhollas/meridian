import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentToolCall, AgentTurnResult } from "@/lib/agent/contracts";
import {
	createChatRequest,
	readRuntimeEvents,
} from "../../tests/support/chat-route";

const mocks = vi.hoisted(() => ({
	createAgentService: vi.fn(),
	getSandboxRuntime: vi.fn(),
	streamConversation: vi.fn(),
}));

vi.mock("@/lib/agent/service", () => ({
	createAgentService: mocks.createAgentService,
}));

vi.mock("@/lib/sandbox/singleton", () => ({
	getSandboxRuntime: mocks.getSandboxRuntime,
}));

import { handleChat } from "@/routes/chat";

const completedToolCall: AgentToolCall = {
	id: "tool-1",
	input: '{"path":"offers.json"}',
	name: "read_file",
	output: '{"offers":2}',
	state: "completed",
};

describe("POST /api/chat", () => {
	beforeEach(() => {
		mocks.getSandboxRuntime.mockReturnValue({ runtime: "docker" });
		mocks.createAgentService.mockReturnValue({
			streamConversation: mocks.streamConversation,
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("returns a validation error when the session id is invalid", async () => {
		const response = await handleChat(
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
		const response = await handleChat(
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

	it("streams chat events and completes the turn", async () => {
		mocks.streamConversation.mockImplementation(
			async ({
				message,
				onEvent,
				sessionId,
			}: {
				message: string;
				onEvent?: (event: {
					text?: string;
					toolCall?: AgentToolCall;
					type: string;
				}) => Promise<void>;
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

		const response = await handleChat(
			createChatRequest({
				message: "Find me an offer",
				sessionId: "session-123",
			}),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain(
			"application/x-ndjson",
		);
		await expect(readRuntimeEvents(response)).resolves.toEqual([
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
		mocks.streamConversation.mockRejectedValue(new Error("agent exploded"));

		const response = await handleChat(
			createChatRequest({
				message: "Find me an offer",
				sessionId: "session-123",
			}),
		);

		await expect(readRuntimeEvents(response)).resolves.toEqual([
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
		mocks.streamConversation.mockRejectedValue(new Error(""));

		const response = await handleChat(
			createChatRequest({
				message: "Find me an offer",
				sessionId: "session-123",
			}),
		);

		await expect(readRuntimeEvents(response)).resolves.toEqual([
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
		const runningToolCall: AgentToolCall = {
			id: "tool-1",
			input: '{"path":"offers.json"}',
			name: "read_file",
			output: "",
			state: "running",
		};

		mocks.streamConversation.mockImplementation(
			async ({
				onEvent,
			}: {
				onEvent?: (event: {
					text?: string;
					toolCall?: AgentToolCall;
					type: string;
				}) => Promise<void>;
			}): Promise<AgentTurnResult> => {
				await onEvent?.({ type: "tool-call", toolCall: runningToolCall });
				await onEvent?.({ type: "tool-call", toolCall: completedToolCall });

				return {
					content: "Done.",
					toolCalls: [completedToolCall],
				};
			},
		);

		const response = await handleChat(
			createChatRequest({
				message: "Read offers",
				sessionId: "session-123",
			}),
		);

		const events = await readRuntimeEvents(response);

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
		mocks.streamConversation.mockImplementation(
			async ({
				onEvent,
			}: {
				onEvent?: (event: {
					text?: string;
					toolCall?: AgentToolCall;
					type: string;
				}) => Promise<void>;
			}) => {
				await onEvent?.({
					type: "text-delta",
					text: "Authentication started. Open the login URL in your browser.",
				});

				throw new Error("device flow requires user interaction");
			},
		);

		const response = await handleChat(
			createChatRequest({
				message: "Start login",
				sessionId: "session-123",
			}),
		);

		await expect(readRuntimeEvents(response)).resolves.toEqual([
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
