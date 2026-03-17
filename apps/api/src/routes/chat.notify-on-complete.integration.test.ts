import { describe, expect, it, vi } from "vitest";
import { createChatRequest } from "../../tests/support/chat-route";
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
		let resolveCompletion!: (result: {
			exitCode: number | null;
			stderr: string;
			stdout: string;
		}) => void;
		const completionPromise = new Promise<{
			exitCode: number | null;
			stderr: string;
			stdout: string;
		}>((resolve) => {
			resolveCompletion = resolve;
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
		await using ctx = await createTestChat({
			createRunner,
			backgroundExecFixtures: [
				{
					command: ["meridian", "auth", "login"],
					result: {
						exitCode: null,
						stderr: "",
						stdout: '{"status":"pending"}',
					},
					completion: completionPromise,
					stdout: '{"status":"authenticated"}\n',
					stderr: "",
				},
			],
			instructions: "Login first.",
		});
		const { POST, collectTurnEvents } = ctx;

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

		// Resolve the background command to trigger the system turn
		resolveCompletion({
			exitCode: 0,
			stderr: "",
			stdout: '{"status":"authenticated"}\n',
		});

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
		let resolveCompletion!: (result: {
			exitCode: number | null;
			stderr: string;
			stdout: string;
		}) => void;
		const completionPromise = new Promise<{
			exitCode: number | null;
			stderr: string;
			stdout: string;
		}>((resolve) => {
			resolveCompletion = resolve;
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
		await using ctx2 = await createTestChat({
			createRunner,
			backgroundExecFixtures: [
				{
					command: ["meridian", "auth", "login"],
					result: {
						exitCode: null,
						stderr: "",
						stdout: '{"status":"pending"}',
					},
					completion: completionPromise,
					stdout: '{"status":"authenticated"}\n',
					stderr: "",
				},
			],
			instructions: "Login first.",
		});
		const { POST, collectTurnEvents, registry } = ctx2;

		const eventsPromise = collectTurnEvents("session-no-notify");
		await POST(
			createChatRequest({
				message: "Login to sky",
				sessionId: "session-no-notify",
			}),
		);
		await eventsPromise;

		// Resolve the background command
		resolveCompletion({
			exitCode: 0,
			stderr: "",
			stdout: '{"status":"authenticated"}\n',
		});

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
