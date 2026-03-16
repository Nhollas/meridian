import { describe } from "vitest";
import { createChatEventFactory } from "../../tests/support/chat-contract";
import { test } from "../../tests/support/chat-page-fixture";

describe("Chat UI - system-initiated turns", () => {
	test("renders an assistant message when the server pushes a turn the client did not initiate", async ({
		chatPage,
		sseStream,
	}) => {
		const systemTurnEvents = createChatEventFactory({
			turnId: "system-turn-1",
		});

		await chatPage.expectReady();

		sseStream.emit(
			systemTurnEvents.create("assistant.delta", {
				delta: "You are now logged in. Let me fetch your broadband deals.",
			}),
		);
		sseStream.emit(
			systemTurnEvents.create("turn.completed", {
				content: "You are now logged in. Let me fetch your broadband deals.",
				toolCalls: [],
			}),
		);

		await chatPage.expectAssistantResponse("You are now logged in");
	});

	test("renders tool activity from a server-pushed turn", async ({
		chatPage,
		sseStream,
	}) => {
		const systemTurnEvents = createChatEventFactory({
			turnId: "system-turn-2",
		});

		await chatPage.expectReady();

		sseStream.emit(
			systemTurnEvents.create("tool.completed", {
				toolCall: {
					id: "tc-1",
					input: '{"command":["meridian","auth","status","--json"]}',
					name: "run_command",
					output: '{"authenticated":true}',
				},
			}),
		);
		sseStream.emit(
			systemTurnEvents.create("turn.completed", {
				content: "You are now logged in. Let me fetch your broadband deals.",
				toolCalls: [
					{
						id: "tc-1",
						input: '{"command":["meridian","auth","status","--json"]}',
						name: "run_command",
						output: '{"authenticated":true}',
						state: "completed",
					},
				],
			}),
		);

		await chatPage.expectAssistantResponse("You are now logged in");
		await chatPage.expectToolActivityVisible("Ran a command");
	});
});
