import { describe, expect, it } from "vitest";
import {
	createChatRequest,
	getParsedToolOutput,
} from "../../tests/support/chat-route";
import {
	assistantText,
	createScriptedAgentRunner,
	invokeTool,
	toolCompleted,
	toolStarted,
} from "../../tests/support/scripted-agent-runner";
import { createTestChat } from "./chat.integration-support";

describe("POST /api/chat integration - runtime commands", () => {
	it("surfaces run_command stdout, stderr, and exit code through tool output", async () => {
		const createRunner = createScriptedAgentRunner(async function* ({ tools }) {
			yield toolStarted({
				id: "tool-1",
				input: { command: ["pwd"] },
				name: "run_command",
			});
			const output = await invokeTool(tools, "run_command", {
				command: ["pwd"],
			});
			yield toolCompleted({
				id: "tool-1",
				name: "run_command",
				output,
			});
			yield assistantText("Working directory checked.");
		});
		const { POST, collectTurnEvents } = await createTestChat({
			createRunner,
			execFixtures: [
				{
					command: ["pwd"],
					result: {
						exitCode: 0,
						stderr: "",
						stdout: "/workspace\n",
					},
				},
			],
		});

		const eventsPromise = collectTurnEvents("session-command");
		await POST(
			createChatRequest({
				message: "Where am I?",
				sessionId: "session-command",
			}),
		);
		const events = await eventsPromise;

		expect(getParsedToolOutput(events, "run_command")).toEqual({
			exitCode: 0,
			stderr: "",
			stdout: "/workspace\n",
		});
		expect(
			events.find((event) => event.type === "turn.completed"),
		).toMatchObject({
			sessionId: "session-command",
			type: "turn.completed",
			payload: {
				content: "Working directory checked.",
				toolCalls: [
					{
						id: "tool-1",
						input: '{"command":["pwd"]}',
						name: "run_command",
						output: '{"exitCode":0,"stderr":"","stdout":"/workspace\\n"}',
						state: "completed",
					},
				],
			},
		});
	});

	it("emits turn.failed when a command exits non-zero and the agent cannot recover", async () => {
		const createRunner = createScriptedAgentRunner(async function* ({ tools }) {
			yield toolStarted({
				id: "tool-1",
				input: { command: ["bash", "-lc", "exit 23"] },
				name: "run_command",
			});
			const output = await invokeTool(tools, "run_command", {
				command: ["bash", "-lc", "exit 23"],
			});
			yield toolCompleted({
				id: "tool-1",
				name: "run_command",
				output,
			});

			const parsed = JSON.parse(String(output)) as {
				exitCode: number;
				stderr: string;
			};
			if (parsed.exitCode !== 0) {
				throw new Error(
					`Command failed with exit code ${parsed.exitCode}: ${parsed.stderr}`,
				);
			}
		});
		const { POST, collectTurnEvents } = await createTestChat({
			createRunner,
			execFixtures: [
				{
					command: ["bash", "-lc", "exit 23"],
					result: {
						exitCode: 23,
						stderr: "permission denied",
						stdout: "",
					},
				},
			],
		});

		const eventsPromise = collectTurnEvents("session-command");
		await POST(
			createChatRequest({
				message: "Run the broken command",
				sessionId: "session-command",
			}),
		);
		const events = await eventsPromise;

		expect(events).toEqual([
			expect.objectContaining({
				sequence: 1,
				sessionId: "session-command",
				turnId: "turn-1",
				type: "tool.started",
				payload: {
					toolCall: {
						id: "tool-1",
						input: '{"command":["bash","-lc","exit 23"]}',
						name: "run_command",
					},
				},
			}),
			expect.objectContaining({
				sequence: 2,
				sessionId: "session-command",
				turnId: "turn-1",
				type: "tool.completed",
				payload: {
					toolCall: {
						id: "tool-1",
						input: '{"command":["bash","-lc","exit 23"]}',
						name: "run_command",
						output: '{"exitCode":23,"stderr":"permission denied","stdout":""}',
					},
				},
			}),
			expect.objectContaining({
				sequence: 3,
				sessionId: "session-command",
				turnId: "turn-1",
				type: "turn.failed",
				payload: {
					error: "Command failed with exit code 23: permission denied",
				},
			}),
		]);
	});
});
