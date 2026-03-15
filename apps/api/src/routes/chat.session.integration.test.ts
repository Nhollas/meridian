import { describe, expect, it } from "vitest";
import { createChatRequest } from "../../tests/support/chat-route";
import { createInMemorySandboxRuntime } from "../../tests/support/in-memory-runtime";
import {
	assistantText,
	createScriptedAgentRunner,
	invokeTool,
	toolCompleted,
	toolFailed,
	toolStarted,
} from "../../tests/support/scripted-agent-runner";
import { createTestChat } from "./chat.integration-support";

describe("POST /api/chat integration - session behavior", () => {
	it("keeps conversation continuity when the same session sends later turns", async () => {
		const historyBySession = new Map<string, string[]>();
		const runtime = createInMemorySandboxRuntime();
		const createRunner = createScriptedAgentRunner(async function* ({
			message,
			sessionId,
		}) {
			const history = [...(historyBySession.get(sessionId) ?? []), message];
			historyBySession.set(sessionId, history);

			yield assistantText(`Messages so far: ${history.join(" -> ")}`);
		});
		const { POST, collectTurnEvents } = createTestChat({
			createRunner,
			runtime,
		});

		const firstEventsPromise = collectTurnEvents("session-123");
		await POST(
			createChatRequest({
				message: "first",
				sessionId: "session-123",
			}),
		);
		const firstTurn = await firstEventsPromise;

		const secondEventsPromise = collectTurnEvents("session-123");
		await POST(
			createChatRequest({
				message: "second",
				sessionId: "session-123",
			}),
		);
		const secondTurn = await secondEventsPromise;

		expect(firstTurn).toEqual([
			expect.objectContaining({
				sequence: 1,
				sessionId: "session-123",
				turnId: "turn-1",
				type: "assistant.delta",
				payload: { delta: "Messages so far: first" },
			}),
			expect.objectContaining({
				sequence: 2,
				sessionId: "session-123",
				turnId: "turn-1",
				type: "turn.completed",
				payload: { content: "Messages so far: first", toolCalls: [] },
			}),
		]);
		expect(secondTurn).toEqual([
			expect.objectContaining({
				sequence: 1,
				sessionId: "session-123",
				turnId: "turn-2",
				type: "assistant.delta",
				payload: { delta: "Messages so far: first -> second" },
			}),
			expect.objectContaining({
				sequence: 2,
				sessionId: "session-123",
				turnId: "turn-2",
				type: "turn.completed",
				payload: {
					content: "Messages so far: first -> second",
					toolCalls: [],
				},
			}),
		]);
	});

	it("keeps session workspaces isolated from each other", async () => {
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
						contents: "private to session-a",
						path: "notes/todo.txt",
					},
					name: "write_file",
				});
				const output = await invokeTool(tools, "write_file", {
					contents: "private to session-a",
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
			try {
				const output = await invokeTool(tools, "read_file", {
					path: "notes/todo.txt",
				});
				yield toolCompleted({
					id: "tool-2",
					name: "read_file",
					output,
				});
			} catch (error) {
				yield toolFailed({
					error: error instanceof Error ? error.message : String(error),
					id: "tool-2",
					name: "read_file",
				});
				yield assistantText(`No note found for ${sessionId}.`);
			}
		});
		const { POST, collectTurnEvents } = createTestChat({
			createRunner,
			runtime,
		});

		const saveEventsPromise = collectTurnEvents("session-a");
		await POST(
			createChatRequest({
				message: "Save note",
				sessionId: "session-a",
			}),
		);
		await saveEventsPromise;

		const isolatedEventsPromise = collectTurnEvents("session-b");
		await POST(
			createChatRequest({
				message: "Read note",
				sessionId: "session-b",
			}),
		);
		const isolatedTurn = await isolatedEventsPromise;

		expect(isolatedTurn).toEqual([
			expect.objectContaining({
				sequence: 1,
				sessionId: "session-b",
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
				sessionId: "session-b",
				turnId: "turn-2",
				type: "tool.failed",
				payload: {
					toolCall: {
						id: "tool-2",
						input: '{"path":"notes/todo.txt"}',
						name: "read_file",
						output: "File not found: notes/todo.txt",
					},
				},
			}),
			expect.objectContaining({
				sequence: 3,
				sessionId: "session-b",
				turnId: "turn-2",
				type: "assistant.delta",
				payload: {
					delta: "No note found for session-b.",
				},
			}),
			expect.objectContaining({
				sequence: 4,
				sessionId: "session-b",
				turnId: "turn-2",
				type: "turn.completed",
				payload: {
					content: "No note found for session-b.",
					toolCalls: [
						{
							id: "tool-2",
							input: '{"path":"notes/todo.txt"}',
							name: "read_file",
							output: "File not found: notes/todo.txt",
							state: "failed",
						},
					],
				},
			}),
		]);
		expect(runtime.calls).toEqual([
			{
				args: ["notes/todo.txt", "private to session-a"],
				method: "writeSessionFile",
				sessionId: "session-a",
			},
			{
				args: ["notes/todo.txt"],
				method: "readSessionFile",
				sessionId: "session-b",
			},
		]);
	});
});
