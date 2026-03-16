import { describe, expect, it, vi } from "vitest";
import { createChatRequest } from "../../tests/support/chat-route";
import { createInMemorySandboxRuntime } from "../../tests/support/in-memory-runtime";
import {
	assistantText,
	createScriptedAgentRunner,
	invokeTool,
	toolCompleted,
	toolStarted,
} from "../../tests/support/scripted-agent-runner";
import { createTestChat } from "./chat.integration-support";

describe("POST /api/chat integration - notify on complete", () => {
	it("triggers a system turn when a background command finishes and notifyOnComplete is true", async () => {
		const runtime = createInMemorySandboxRuntime({
			backgroundCommands: {
				"bg-1": {
					current: {
						command: ["meridian", "auth", "login"],
						exitCode: null,
						startedAt: "2026-03-16T12:00:00.000Z",
						status: "running",
						stderr: "",
						stdout: '{"status":"pending"}\n',
					},
					waitResult: {
						command: ["meridian", "auth", "login"],
						endedAt: "2026-03-16T12:00:05.000Z",
						exitCode: 0,
						id: "bg-1",
						startedAt: "2026-03-16T12:00:00.000Z",
						status: "completed",
						stderr: "",
						stdout: '{"status":"authenticated"}\n',
					},
				},
			},
			commandFixtures: [
				{
					command: ["meridian", "auth", "login"],
					options: {
						keepAlive: true,
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
			instructions: "Login first.",
		});
		const createRunner = createScriptedAgentRunner(async function* ({
			message,
			tools,
		}) {
			if (message.startsWith("[System]")) {
				yield assistantText("Background command completed. Continuing.");
				return;
			}

			yield toolStarted({
				id: "tool-1",
				input: {
					command: ["meridian", "auth", "login"],
					keepAlive: true,
					notifyOnComplete: true,
					waitFor: "first-stdout-line",
				},
				name: "run_command",
			});
			const result = await invokeTool(tools, "run_command", {
				command: ["meridian", "auth", "login"],
				keepAlive: true,
				notifyOnComplete: true,
				waitFor: "first-stdout-line",
			});
			yield toolCompleted({
				id: "tool-1",
				name: "run_command",
				output: result,
			});

			yield assistantText(
				"I've started the login process. You'll be notified when it completes.",
			);
		});
		const { POST, collectTurnEvents } = createTestChat({
			createRunner,
			runtime,
		});

		const userTurnEventsPromise = collectTurnEvents("session-notify");
		await POST(
			createChatRequest({
				message: "Login to sky",
				sessionId: "session-notify",
			}),
		);
		await userTurnEventsPromise;

		// The background command completion triggers a system turn via the engine
		const systemTurnEventsPromise = collectTurnEvents("session-notify");

		const systemTurnEvents = await systemTurnEventsPromise;

		expect(systemTurnEvents).toEqual([
			expect.objectContaining({
				type: "assistant.delta",
				sessionId: "session-notify",
			}),
			expect.objectContaining({
				type: "turn.completed",
				sessionId: "session-notify",
				payload: expect.objectContaining({
					content: "Background command completed. Continuing.",
				}),
			}),
		]);
	});

	it("does not trigger a system turn when notifyOnComplete is not set", async () => {
		const runtime = createInMemorySandboxRuntime({
			backgroundCommands: {
				"bg-1": {
					current: {
						command: ["meridian", "auth", "login"],
						exitCode: null,
						startedAt: "2026-03-16T12:00:00.000Z",
						status: "running",
						stderr: "",
						stdout: '{"status":"pending"}\n',
					},
					waitResult: {
						command: ["meridian", "auth", "login"],
						endedAt: "2026-03-16T12:00:05.000Z",
						exitCode: 0,
						id: "bg-1",
						startedAt: "2026-03-16T12:00:00.000Z",
						status: "completed",
						stderr: "",
						stdout: '{"status":"authenticated"}\n',
					},
				},
			},
			commandFixtures: [
				{
					command: ["meridian", "auth", "login"],
					options: {
						keepAlive: true,
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
			instructions: "Login first.",
		});
		const createRunner = createScriptedAgentRunner(async function* ({ tools }) {
			yield toolStarted({
				id: "tool-1",
				input: {
					command: ["meridian", "auth", "login"],
					keepAlive: true,
					waitFor: "first-stdout-line",
				},
				name: "run_command",
			});
			const result = await invokeTool(tools, "run_command", {
				command: ["meridian", "auth", "login"],
				keepAlive: true,
				waitFor: "first-stdout-line",
			});
			yield toolCompleted({
				id: "tool-1",
				name: "run_command",
				output: result,
			});

			yield assistantText("Started login without notification.");
		});
		const { POST, collectTurnEvents, registry } = createTestChat({
			createRunner,
			runtime,
		});

		const eventsPromise = collectTurnEvents("session-no-notify");
		await POST(
			createChatRequest({
				message: "Login to sky",
				sessionId: "session-no-notify",
			}),
		);
		await eventsPromise;

		// Give async operations time to settle
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Verify no additional events were written (no system turn triggered)
		const spy = vi.fn();
		registry.register("session-no-notify", { writeSSE: spy });
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(spy).not.toHaveBeenCalled();
		registry.unregister("session-no-notify");
	});
});
