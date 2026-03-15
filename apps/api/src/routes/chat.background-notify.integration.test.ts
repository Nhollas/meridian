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

describe("POST /api/chat integration - background command notification", () => {
	it("emits background.completed on the event bus when a notifiable command finishes", async () => {
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
						stdout: '{"status":"pending","userCode":"ABCD-1234"}',
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
						stdout: '{"status":"pending","userCode":"ABCD-1234"}\n',
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
		const createRunner = createScriptedAgentRunner(async function* ({ tools }) {
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
			yield assistantText("Login started. Complete it in your browser.");
		});
		const { POST, eventBus } = createTestChat({ createRunner, runtime });

		// Collect turn events first
		const turnEventsPromise = collectTurnEvents(eventBus, "session-notify");
		await POST(
			createChatRequest({
				message: "Log me in",
				sessionId: "session-notify",
			}),
		);
		const turnEvents = await turnEventsPromise;

		// Turn should complete normally
		expect(turnEvents.at(-1)).toMatchObject({
			type: "turn.completed",
		});

		// Subscribe before completing, so we catch the event
		const stream = eventBus.subscribe("session-notify").stream;
		const reader = stream.getReader();

		// Now simulate the background command completing
		runtime.completeBackgroundCommand("session-notify", "bg-1");

		const { value: bgEvent } = await reader.read();
		reader.releaseLock();

		expect(bgEvent).toMatchObject({
			type: "background.completed",
			sessionId: "session-notify",
			payload: {
				backgroundCommandId: "bg-1",
				command: ["meridian", "auth", "login", "--json"],
				exitCode: 0,
			},
		});
	});

	it("auto-triggers a new agent turn when a notifiable command completes", async () => {
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
						stdout: '{"status":"authenticated","user":"nick@example.com"}\n',
					},
				},
			},
		});
		const createRunner = createScriptedAgentRunner(async function* ({
			message,
			tools,
		}) {
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

			// Re-engagement turn — agent sees the completion message
			expect(message).toContain("bg-1");
			expect(message).toContain("completed");
			yield assistantText("You're authenticated as nick@example.com.");
		});
		const { POST, eventBus } = createTestChat({ createRunner, runtime });

		// First turn: agent starts background command
		const turnEventsPromise = collectTurnEvents(eventBus, "session-reengage");
		await POST(
			createChatRequest({
				message: "Log me in",
				sessionId: "session-reengage",
			}),
		);
		await turnEventsPromise;

		// Subscribe to catch background event + re-engagement turn
		const stream = eventBus.subscribe("session-reengage").stream;
		const reader = stream.getReader();

		// Complete the background command
		runtime.completeBackgroundCommand("session-reengage", "bg-1");

		// Should see: background.completed, then agent turn events
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
				content: "You're authenticated as nick@example.com.",
			},
		});
	});
});
