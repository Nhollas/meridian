import { describe, expect, it } from "vitest";
import { createChatRequest } from "../../tests/support/chat-route";
import { createInMemorySandboxRuntime } from "../../tests/support/in-memory-runtime";
import {
	assistantText,
	createScriptedAgentRunner,
	invokeTool,
	toolCompleted,
	toolStarted,
} from "../../tests/support/scripted-agent-runner";
import { collectTurnEvents, createTestChat } from "./chat.integration-support";

describe("POST /api/chat integration - turn lifecycle", () => {
	it("returns 202 and streams events through the event bus", async () => {
		const runtime = createInMemorySandboxRuntime({
			files: {
				"offers.json": '{"offers":2}',
			},
			instructions: "Call get_runtime_instructions before reading files.",
		});
		const createRunner = createScriptedAgentRunner(async function* ({
			message,
			sessionId,
			tools,
		}) {
			expect(message).toBe("Find me an offer");
			expect(sessionId).toBe("session-123");

			yield toolStarted({
				id: "tool-1",
				input: {},
				name: "get_runtime_instructions",
			});
			const instructions = await invokeTool(
				tools,
				"get_runtime_instructions",
				{},
			);
			yield toolCompleted({
				id: "tool-1",
				name: "get_runtime_instructions",
				output: instructions,
			});

			yield toolStarted({
				id: "tool-2",
				input: { path: "offers.json" },
				name: "read_file",
			});
			const fileContents = await invokeTool(tools, "read_file", {
				path: "offers.json",
			});
			yield toolCompleted({
				id: "tool-2",
				name: "read_file",
				output: fileContents,
			});

			yield assistantText("I found 2 offers worth comparing.");
		});
		const { POST, eventBus } = createTestChat({ createRunner, runtime });

		const eventsPromise = collectTurnEvents(eventBus, "session-123");
		const response = await POST(
			createChatRequest({
				message: "Find me an offer",
				sessionId: "session-123",
			}),
		);

		expect(response.status).toBe(202);
		const body = await response.json();
		expect(body).toEqual({ turnId: "turn-1" });

		const events = await eventsPromise;
		expect(events).toEqual([
			expect.objectContaining({
				sequence: 1,
				sessionId: "session-123",
				turnId: "turn-1",
				type: "tool.started",
				payload: expect.objectContaining({
					toolCall: expect.objectContaining({
						id: "tool-1",
						input: "{}",
						name: "get_runtime_instructions",
					}),
				}),
			}),
			expect.objectContaining({
				sequence: 2,
				type: "tool.completed",
				payload: expect.objectContaining({
					toolCall: expect.objectContaining({
						id: "tool-1",
						input: "{}",
						name: "get_runtime_instructions",
						output: "Call get_runtime_instructions before reading files.",
					}),
				}),
			}),
			expect.objectContaining({
				sequence: 3,
				type: "tool.started",
				payload: expect.objectContaining({
					toolCall: expect.objectContaining({
						id: "tool-2",
						input: '{"path":"offers.json"}',
						name: "read_file",
					}),
				}),
			}),
			expect.objectContaining({
				sequence: 4,
				type: "tool.completed",
				payload: expect.objectContaining({
					toolCall: expect.objectContaining({
						id: "tool-2",
						input: '{"path":"offers.json"}',
						name: "read_file",
						output: '{"offers":2}',
					}),
				}),
			}),
			expect.objectContaining({
				sequence: 5,
				payload: expect.objectContaining({
					delta: "I found 2 offers worth comparing.",
				}),
				type: "assistant.delta",
			}),
			expect.objectContaining({
				sequence: 6,
				type: "turn.completed",
				payload: expect.objectContaining({
					content: "I found 2 offers worth comparing.",
					toolCalls: [
						{
							id: "tool-1",
							input: "{}",
							name: "get_runtime_instructions",
							output: "Call get_runtime_instructions before reading files.",
							state: "completed",
						},
						{
							id: "tool-2",
							input: '{"path":"offers.json"}',
							name: "read_file",
							output: '{"offers":2}',
							state: "completed",
						},
					],
				}),
			}),
		]);
		expect(runtime.calls).toEqual([
			{
				args: [],
				method: "getInstructions",
				sessionId: "session-123",
			},
			{
				args: ["offers.json"],
				method: "readSessionFile",
				sessionId: "session-123",
			},
		]);
	});
});
