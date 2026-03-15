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

describe("POST /api/chat integration - streaming token recovery", () => {
	it("recovers agent response from checkpoint when streamed tokens are lost", async () => {
		const runtime = createInMemorySandboxRuntime();
		const createRunner = createScriptedAgentRunner(
			async function* () {
				// Simulate lost tokens: yield no message chunks.
				// This mirrors the real LangGraph bug where
				// StreamMessagesHandler writes to a closed controller,
				// causing all text-delta chunks to be silently dropped.
			},
			{
				getCompleteResponse: async () =>
					"Authentication successful! You are now logged in.",
			},
		);
		const { POST, eventBus } = createTestChat({ createRunner, runtime });

		const eventsPromise = collectTurnEvents(eventBus, "session-recovery");
		await POST(
			createChatRequest({
				message: "Background command bg-1 completed.",
				sessionId: "session-recovery",
			}),
		);
		const events = await eventsPromise;

		const deltas = events.filter((e) => e.type === "assistant.delta");
		expect(deltas).toHaveLength(1);
		expect(deltas[0]).toMatchObject({
			type: "assistant.delta",
			payload: {
				delta: "Authentication successful! You are now logged in.",
			},
		});

		expect(events.at(-1)).toMatchObject({
			type: "turn.completed",
			payload: {
				content: "Authentication successful! You are now logged in.",
			},
		});
	});

	it("uses streamed tokens when available and does not call getCompleteResponse", async () => {
		let getCompleteResponseCalled = false;
		const runtime = createInMemorySandboxRuntime();
		const createRunner = createScriptedAgentRunner(
			async function* () {
				yield assistantText("Streamed response from agent.");
			},
			{
				getCompleteResponse: async () => {
					getCompleteResponseCalled = true;
					return "This should NOT appear.";
				},
			},
		);
		const { POST, eventBus } = createTestChat({ createRunner, runtime });

		const eventsPromise = collectTurnEvents(eventBus, "session-normal");
		await POST(
			createChatRequest({
				message: "Hello",
				sessionId: "session-normal",
			}),
		);
		const events = await eventsPromise;

		expect(events.at(-1)).toMatchObject({
			type: "turn.completed",
			payload: {
				content: "Streamed response from agent.",
			},
		});
		expect(getCompleteResponseCalled).toBe(false);
	});

	it("falls back to default message when both streaming and recovery fail", async () => {
		const runtime = createInMemorySandboxRuntime();
		const createRunner = createScriptedAgentRunner(
			async function* () {
				// No message chunks — streaming lost tokens
			},
			{
				getCompleteResponse: async () => undefined,
			},
		);
		const { POST, eventBus } = createTestChat({ createRunner, runtime });

		const eventsPromise = collectTurnEvents(eventBus, "session-fallback");
		await POST(
			createChatRequest({
				message: "Hello",
				sessionId: "session-fallback",
			}),
		);
		const events = await eventsPromise;

		expect(events.at(-1)).toMatchObject({
			type: "turn.completed",
			payload: {
				content:
					"I ran into an issue processing that request. Could you try again?",
			},
		});
	});

	it("recovers response during a re-engagement turn triggered by background completion", async () => {
		let turnIndex = 0;
		const runtime = createInMemorySandboxRuntime({
			commandFixtures: [
				{
					command: ["meridian", "auth", "login", "--json"],
					options: {
						keepAlive: true,
						notifyOnCompletion: true,
						waitFor: "first-stdout-line",
					},
					result: {
						backgroundCommandId: "bg-1",
						exitCode: null,
						status: "running",
						stderr: "",
						stdout: '{"status":"pending"}',
					},
				},
			],
			backgroundCommands: {
				"bg-1": {
					current: {
						command: ["meridian", "auth", "login", "--json"],
						exitCode: null,
						startedAt: "2026-03-11T12:00:00.000Z",
						status: "running",
						stderr: "",
						stdout: '{"status":"pending"}\n',
					},
					waitResult: {
						command: ["meridian", "auth", "login", "--json"],
						endedAt: "2026-03-11T12:00:05.000Z",
						exitCode: 0,
						id: "bg-1",
						startedAt: "2026-03-11T12:00:00.000Z",
						status: "completed",
						stderr: "",
						stdout: '{"status":"authenticated"}\n',
					},
				},
			},
		});
		const createRunner = createScriptedAgentRunner(
			async function* ({ tools }) {
				turnIndex++;
				if (turnIndex === 1) {
					yield toolStarted({
						id: "tool-1",
						input: {
							command: ["meridian", "auth", "login", "--json"],
							keepAlive: true,
							notifyOnCompletion: true,
							waitFor: "first-stdout-line",
						},
						name: "run_command",
					});
					const output = await invokeTool(tools, "run_command", {
						command: ["meridian", "auth", "login", "--json"],
						keepAlive: true,
						notifyOnCompletion: true,
						waitFor: "first-stdout-line",
					});
					yield toolCompleted({
						id: "tool-1",
						name: "run_command",
						output,
					});
					yield assistantText("Login started.");
					return;
				}

				// Re-engagement turn: simulate lost streaming tokens.
				// The agent responds but StreamMessagesHandler drops all tokens.
				// Only tool events (if any) would be visible.
				// getCompleteResponse should recover the content.
			},
			{
				getCompleteResponse: async () => {
					if (turnIndex >= 2) {
						return "You're now authenticated.";
					}
					return undefined;
				},
			},
		);
		const { POST, eventBus } = createTestChat({ createRunner, runtime });

		// First turn: agent starts background command
		const turnEventsPromise = collectTurnEvents(
			eventBus,
			"session-reengage-recovery",
		);
		await POST(
			createChatRequest({
				message: "Log me in",
				sessionId: "session-reengage-recovery",
			}),
		);
		await turnEventsPromise;

		// Subscribe to catch background event + re-engagement turn
		const stream = eventBus.subscribe("session-reengage-recovery").stream;
		const reader = stream.getReader();

		// Complete the background command — triggers re-engagement
		runtime.completeBackgroundCommand("session-reengage-recovery", "bg-1");

		const events = [];
		while (true) {
			const { value } = await reader.read();
			if (!value) break;
			events.push(value);
			if (value.type === "turn.completed" || value.type === "turn.failed") {
				break;
			}
		}
		reader.releaseLock();

		expect(events[0]).toMatchObject({
			type: "background.completed",
		});
		expect(events.at(-1)).toMatchObject({
			type: "turn.completed",
			payload: {
				content: "You're now authenticated.",
			},
		});
	});
});
