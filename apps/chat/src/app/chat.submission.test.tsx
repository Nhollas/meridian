import { http } from "msw";
import { describe } from "vitest";
import {
	createChatEventFactory,
	createChatStreamResponse,
} from "../../tests/support/chat-contract";
import { test } from "../../tests/support/chat-page-fixture";
import {
	browserWorker,
	withHeaders,
	withJsonBody,
} from "../../tests/support/msw";

describe("Chat UI - submission and streaming", () => {
	test("submits a message and renders streamed contract events", async ({
		chatPage,
	}) => {
		const eventFactory = createChatEventFactory();

		browserWorker.use(
			http.post(
				"http://localhost:3201/api/chat",
				withJsonBody(
					{ message: "Find me a deal" },
					withHeaders(
						(headers) =>
							headers.get("content-type") === "application/json" &&
							headers.has("session-id") &&
							headers.get("meridian-debug-stream-delay-ms") === "0",
						() =>
							createChatStreamResponse([
								eventFactory.create("assistant.delta", {
									delta: "Working through the options...",
								}),
								eventFactory.create("tool.completed", {
									toolCall: {
										id: "tool-1",
										input: '{"path":"offers.json"}',
										name: "read_file",
										output: '{"offers":2}',
									},
								}),
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
							]),
					),
				),
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
