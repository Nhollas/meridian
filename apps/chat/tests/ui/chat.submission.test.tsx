import { http } from "msw";
import { describe } from "vitest";
import {
	createChatEventFactory,
	createChatStreamResponse,
} from "./chat-contract";
import { expect, test } from "./chat-page-fixture";
import { browserWorker } from "./msw";

describe("Chat UI - submission and streaming", () => {
	test("submits a message and renders streamed contract events", async ({
		chatPage,
	}) => {
		let requestBody: unknown;
		let requestHeaders: Record<string, string> | null = null;
		const eventFactory = createChatEventFactory();

		browserWorker.use(
			http.post("http://localhost:3201/api/chat", async ({ request }) => {
				requestBody = await request.json();
				requestHeaders = Object.fromEntries(request.headers.entries());

				return createChatStreamResponse([
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
				]);
			}),
		);

		await chatPage.expectReady();
		await chatPage.sendMessage("Find me a deal");

		await chatPage.expectUserMessage("Find me a deal");
		await chatPage.expectAssistantResponse("I found 2 offers worth comparing.");
		await chatPage.expectToolActivityVisible("Read a file");
		await chatPage.expectMessageInputValue("");
		expect(requestBody).toMatchObject({
			message: "Find me a deal",
		});
		expect(requestHeaders).toMatchObject({
			"content-type": "application/json",
			"session-id": expect.any(String),
			"meridian-debug-stream-delay-ms": "0",
		});
	});
});
