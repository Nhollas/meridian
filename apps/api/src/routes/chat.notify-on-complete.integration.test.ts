import { describe, expect, it } from "vitest";
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
	it("triggers a system turn when a background command finishes", async () => {
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
					label: "Logging into Sky",
				},
				name: "start_background_command",
			});
			const result = await invokeTool(tools, "start_background_command", {
				command: ["meridian", "auth", "login"],
				label: "Logging into Sky",
			});
			yield toolCompleted({
				id: "tool-1",
				name: "start_background_command",
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
		const userTurnEvents = await userTurnEventsPromise;

		expect(userTurnEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "background_task.started",
					sessionId: "session-notify",
					turnId: "turn-1",
					payload: expect.objectContaining({
						label: "Logging into Sky",
						taskId: expect.any(String),
					}),
				}),
			]),
		);

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
				type: "background_task.completed",
				sessionId: "session-notify",
				turnId: "turn-1",
				payload: expect.objectContaining({
					status: "completed",
					taskId: expect.any(String),
				}),
			}),
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
});
