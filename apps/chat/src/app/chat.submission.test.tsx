import { http } from "msw";
import { describe } from "vitest";
import {
	createChatAcceptedResponse,
	createChatEventFactory,
} from "../../tests/support/chat-contract";
import { test } from "../../tests/support/chat-page-fixture";
import { browserWorker, withJsonBody } from "../../tests/support/msw";

describe("Chat UI - submission and streaming", () => {
	test("submits a message and renders streamed contract events", async ({
		chatPage,
		sseStream,
	}) => {
		const eventFactory = createChatEventFactory();

		browserWorker.use(
			http.post(
				"http://localhost:3201/api/chat",
				withJsonBody({ message: "Find me a deal" }, () => {
					setTimeout(() => {
						sseStream.emit(
							eventFactory.create("assistant.delta", {
								delta: "Working through the options...",
							}),
						);
						sseStream.emit(
							eventFactory.create("tool.completed", {
								toolCall: {
									id: "tool-1",
									input: '{"path":"offers.json"}',
									name: "read_file",
									output: '{"offers":2}',
								},
							}),
						);
						sseStream.emit(
							eventFactory.create("turn.completed", {
								content: "I found 2 offers worth comparing.",
								toolCalls: [
									{
										id: "tool-1",
										input: '{"path":"offers.json"}',
										name: "read_file",
										output: '{"offers":2}',
										state: "completed",
									},
								],
							}),
						);
					});
					return createChatAcceptedResponse("turn-123");
				}),
			),
		);

		await chatPage.expectReady();
		await chatPage.sendMessage("Find me a deal");

		await chatPage.expectUserMessage("Find me a deal");
		await chatPage.expectAssistantResponse("I found 2 offers worth comparing.");
		await chatPage.expectToolActivityVisible("Read a file");
		await chatPage.expectMessageInputValue("");
	});
});
