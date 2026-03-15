import { describe, expect, it } from "vitest";
import {
	createChatRequest,
	getParsedToolOutput,
} from "../../tests/support/chat-route";
import { createInMemorySandboxRuntime } from "../../tests/support/in-memory-runtime";
import {
	assistantText,
	createScriptedAgentRunner,
	invokeTool,
	simulateInterrupt,
	toolCompleted,
	toolStarted,
} from "../../tests/support/scripted-agent-runner";
import { createTestChat } from "./chat.integration-support";

describe("POST /api/chat integration - interrupt/resume", () => {
	it("interrupts on await_background_completion, waits for the command, then resumes the agent with the result", async () => {
		const runtime = createInMemorySandboxRuntime({
			backgroundCommands: {
				"bg-1": {
					current: {
						command: ["meridian", "auth", "login", "--json"],
						exitCode: null,
						startedAt: "2026-03-11T12:00:00.000Z",
						status: "running",
						stderr: "",
						stdout:
							'{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}\n',
					},
					waitResult: {
						command: ["meridian", "auth", "login", "--json"],
						endedAt: "2026-03-11T12:00:05.000Z",
						exitCode: 0,
						id: "bg-1",
						startedAt: "2026-03-11T12:00:00.000Z",
						status: "completed",
						stderr: "",
						stdout:
							'{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}\n{"status":"authenticated","user":"john.doe@example.com"}\n',
					},
				},
			},
			commandFixtures: [
				{
					command: ["meridian", "auth", "login", "--json"],
					options: {
						keepAlive: true,
						waitFor: "first-stdout-line",
					},
					result: {
						backgroundCommandId: "bg-1",
						exitCode: null,
						status: "running",
						stderr: "",
						stdout:
							'{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}',
					},
				},
			],
		});

		const createRunner = createScriptedAgentRunner(
			async function* ({ tools }) {
				yield toolStarted({
					id: "tool-1",
					input: {
						command: ["meridian", "auth", "login", "--json"],
						keepAlive: true,
						waitFor: "first-stdout-line",
					},
					name: "run_command",
				});
				const backgroundResult = await invokeTool(tools, "run_command", {
					command: ["meridian", "auth", "login", "--json"],
					keepAlive: true,
					waitFor: "first-stdout-line",
				});
				yield toolCompleted({
					id: "tool-1",
					name: "run_command",
					output: backgroundResult,
				});

				// Simulate what happens when await_background_completion calls interrupt()
				yield toolStarted({
					id: "tool-2",
					input: { commandId: "bg-1" },
					name: "await_background_completion",
				});
				simulateInterrupt({
					type: "await_background",
					commandId: "bg-1",
				});
			},
			{
				onResume: async function* ({ resumeValue }) {
					// After resume, the tool "returns" the resume value
					yield toolCompleted({
						id: "tool-2",
						name: "await_background_completion",
						output: JSON.stringify(resumeValue),
					});

					yield assistantText("You're authenticated as john.doe@example.com");
				},
			},
		);

		const { POST, collectTurnEvents } = createTestChat({
			createRunner,
			runtime,
		});

		const eventsPromise = collectTurnEvents("session-interrupt");
		await POST(
			createChatRequest({
				message: "Log me in",
				sessionId: "session-interrupt",
			}),
		);
		const events = await eventsPromise;

		// Verify the full event sequence: tool calls, interrupt, resumed tool completion, turn complete
		expect(events).toEqual([
			expect.objectContaining({
				sequence: 1,
				type: "tool.started",
				payload: expect.objectContaining({
					toolCall: expect.objectContaining({
						name: "run_command",
					}),
				}),
			}),
			expect.objectContaining({
				sequence: 2,
				type: "tool.completed",
				payload: expect.objectContaining({
					toolCall: expect.objectContaining({
						name: "run_command",
					}),
				}),
			}),
			expect.objectContaining({
				sequence: 3,
				type: "tool.started",
				payload: expect.objectContaining({
					toolCall: expect.objectContaining({
						name: "await_background_completion",
					}),
				}),
			}),
			expect.objectContaining({
				sequence: 4,
				type: "turn.interrupted",
				payload: {
					commandId: "bg-1",
				},
			}),
			expect.objectContaining({
				sequence: 5,
				type: "tool.completed",
				payload: expect.objectContaining({
					toolCall: expect.objectContaining({
						name: "await_background_completion",
					}),
				}),
			}),
			expect.objectContaining({
				sequence: 6,
				type: "assistant.delta",
				payload: {
					delta: "You're authenticated as john.doe@example.com",
				},
			}),
			expect.objectContaining({
				sequence: 7,
				type: "turn.completed",
				payload: expect.objectContaining({
					content: "You're authenticated as john.doe@example.com",
				}),
			}),
		]);

		// Verify the await_background_completion tool output contains the wait result
		expect(getParsedToolOutput(events, "await_background_completion")).toEqual({
			command: ["meridian", "auth", "login", "--json"],
			endedAt: "2026-03-11T12:00:05.000Z",
			exitCode: 0,
			id: "bg-1",
			startedAt: "2026-03-11T12:00:00.000Z",
			status: "completed",
			stderr: "",
			stdout:
				'{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}\n{"status":"authenticated","user":"john.doe@example.com"}\n',
		});
	});
});
