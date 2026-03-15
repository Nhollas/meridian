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
	toolCompleted,
	toolFailed,
	toolStarted,
} from "../../tests/support/scripted-agent-runner";
import { collectTurnEvents, createTestChat } from "./chat.integration-support";

describe("POST /api/chat integration - runtime files", () => {
	it("lists directory contents through tool events and the final turn timeline", async () => {
		const runtime = createInMemorySandboxRuntime({
			files: {
				"offers.json": '{"offers":2}',
				"policy.txt": "No refunds",
			},
		});
		const createRunner = createScriptedAgentRunner(async function* ({ tools }) {
			yield toolStarted({
				id: "tool-1",
				input: {},
				name: "list_directory",
			});
			const output = await invokeTool(tools, "list_directory", {});
			yield toolCompleted({
				id: "tool-1",
				name: "list_directory",
				output,
			});
			yield assistantText("I listed the workspace files.");
		});
		const { POST, eventBus } = createTestChat({ createRunner, runtime });

		const eventsPromise = collectTurnEvents(eventBus, "session-files");
		await POST(
			createChatRequest({
				message: "List the workspace",
				sessionId: "session-files",
			}),
		);
		const events = await eventsPromise;

		expect(getParsedToolOutput(events, "list_directory")).toEqual([
			{
				name: "offers.json",
				path: "offers.json",
				type: "file",
			},
			{
				name: "policy.txt",
				path: "policy.txt",
				type: "file",
			},
		]);
		expect(events.at(-1)).toMatchObject({
			sessionId: "session-files",
			turnId: "turn-1",
			type: "turn.completed",
			payload: {
				content: "I listed the workspace files.",
				toolCalls: [
					{
						id: "tool-1",
						input: "{}",
						name: "list_directory",
						output:
							'[{"name":"offers.json","path":"offers.json","type":"file"},{"name":"policy.txt","path":"policy.txt","type":"file"}]',
						state: "completed",
					},
				],
			},
		});
		expect(runtime.calls).toEqual([
			{
				args: ["."],
				method: "listSessionFiles",
				sessionId: "session-files",
			},
		]);
	});

	it("persists files written in one turn so they can be read in a later turn for the same session", async () => {
		const runtime = createInMemorySandboxRuntime();
		const createRunner = createScriptedAgentRunner(async function* ({
			message,
			sessionId,
			tools,
		}) {
			if (message === "Save note") {
				yield toolStarted({
					id: "tool-1",
					input: {
						contents: "buy milk",
						path: "notes/todo.txt",
					},
					name: "write_file",
				});
				const output = await invokeTool(tools, "write_file", {
					contents: "buy milk",
					path: "notes/todo.txt",
				});
				yield toolCompleted({
					id: "tool-1",
					name: "write_file",
					output,
				});
				yield assistantText(`Saved a note for ${sessionId}.`);
				return;
			}

			yield toolStarted({
				id: "tool-2",
				input: { path: "notes/todo.txt" },
				name: "read_file",
			});
			const output = await invokeTool(tools, "read_file", {
				path: "notes/todo.txt",
			});
			yield toolCompleted({
				id: "tool-2",
				name: "read_file",
				output,
			});
			yield assistantText(`Read back: ${output}`);
		});
		const { POST, eventBus } = createTestChat({ createRunner, runtime });

		const writePromise = collectTurnEvents(eventBus, "session-files");
		await POST(
			createChatRequest({
				message: "Save note",
				sessionId: "session-files",
			}),
		);
		const writeTurn = await writePromise;

		const readPromise = collectTurnEvents(eventBus, "session-files");
		await POST(
			createChatRequest({
				message: "Read note",
				sessionId: "session-files",
			}),
		);
		const readTurn = await readPromise;

		expect(writeTurn.at(-1)).toMatchObject({
			sessionId: "session-files",
			turnId: "turn-1",
			type: "turn.completed",
			payload: {
				content: "Saved a note for session-files.",
				toolCalls: [
					{
						id: "tool-1",
						input: '{"contents":"buy milk","path":"notes/todo.txt"}',
						name: "write_file",
						output: '{"path":"/notes/todo.txt"}',
						state: "completed",
					},
				],
			},
		});
		expect(readTurn).toEqual([
			expect.objectContaining({
				sequence: 1,
				sessionId: "session-files",
				turnId: "turn-2",
				type: "tool.started",
				payload: {
					toolCall: {
						id: "tool-2",
						input: '{"path":"notes/todo.txt"}',
						name: "read_file",
					},
				},
			}),
			expect.objectContaining({
				sequence: 2,
				sessionId: "session-files",
				turnId: "turn-2",
				type: "tool.completed",
				payload: {
					toolCall: {
						id: "tool-2",
						input: '{"path":"notes/todo.txt"}',
						name: "read_file",
						output: "buy milk",
					},
				},
			}),
			expect.objectContaining({
				sequence: 3,
				sessionId: "session-files",
				turnId: "turn-2",
				type: "assistant.delta",
				payload: { delta: "Read back: buy milk" },
			}),
			expect.objectContaining({
				sequence: 4,
				sessionId: "session-files",
				turnId: "turn-2",
				type: "turn.completed",
				payload: {
					content: "Read back: buy milk",
					toolCalls: [
						{
							id: "tool-2",
							input: '{"path":"notes/todo.txt"}',
							name: "read_file",
							output: "buy milk",
							state: "completed",
						},
					],
				},
			}),
		]);
		expect(runtime.calls).toEqual([
			{
				args: ["notes/todo.txt", "buy milk"],
				method: "writeSessionFile",
				sessionId: "session-files",
			},
			{
				args: ["notes/todo.txt"],
				method: "readSessionFile",
				sessionId: "session-files",
			},
		]);
	});

	it("fails clearly when a file path escapes the session workspace", async () => {
		const runtime = createInMemorySandboxRuntime({
			enforcePathSafety: true,
		});
		const createRunner = createScriptedAgentRunner(async function* ({ tools }) {
			yield toolStarted({
				id: "tool-1",
				input: { path: "../secrets.txt" },
				name: "read_file",
			});
			try {
				const output = await invokeTool(tools, "read_file", {
					path: "../secrets.txt",
				});
				yield toolCompleted({
					id: "tool-1",
					name: "read_file",
					output,
				});
			} catch (error) {
				yield toolFailed({
					error: error instanceof Error ? error.message : String(error),
					id: "tool-1",
					name: "read_file",
				});
				yield assistantText("That path is outside the session workspace.");
			}
		});
		const { POST, eventBus } = createTestChat({ createRunner, runtime });

		const eventsPromise = collectTurnEvents(eventBus, "session-files");
		await POST(
			createChatRequest({
				message: "Read ../secrets.txt",
				sessionId: "session-files",
			}),
		);
		const events = await eventsPromise;

		expect(events).toEqual([
			expect.objectContaining({
				sequence: 1,
				sessionId: "session-files",
				turnId: "turn-1",
				type: "tool.started",
				payload: {
					toolCall: {
						id: "tool-1",
						input: '{"path":"../secrets.txt"}',
						name: "read_file",
					},
				},
			}),
			expect.objectContaining({
				sequence: 2,
				sessionId: "session-files",
				turnId: "turn-1",
				type: "tool.failed",
				payload: {
					toolCall: {
						id: "tool-1",
						input: '{"path":"../secrets.txt"}',
						name: "read_file",
						output: "Session file path escapes the sandbox session directory.",
					},
				},
			}),
			expect.objectContaining({
				sequence: 3,
				sessionId: "session-files",
				turnId: "turn-1",
				type: "assistant.delta",
				payload: {
					delta: "That path is outside the session workspace.",
				},
			}),
			expect.objectContaining({
				sequence: 4,
				sessionId: "session-files",
				turnId: "turn-1",
				type: "turn.completed",
				payload: {
					content: "That path is outside the session workspace.",
					toolCalls: [
						{
							id: "tool-1",
							input: '{"path":"../secrets.txt"}',
							name: "read_file",
							output:
								"Session file path escapes the sandbox session directory.",
							state: "failed",
						},
					],
				},
			}),
		]);
		expect(runtime.calls).toEqual([
			{
				args: ["../secrets.txt"],
				method: "readSessionFile",
				sessionId: "session-files",
			},
		]);
	});
});
