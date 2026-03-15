import { http } from "msw";
import { describe } from "vitest";
import {
	createChatAcceptedResponse,
	createChatEventFactory,
} from "../../tests/support/chat-contract";
import { test } from "../../tests/support/chat-page-fixture";
import { browserWorker, withJsonBody } from "../../tests/support/msw";

describe("Chat UI - loading state", () => {
	test("disables controls while a chat request is still streaming", async ({
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
					});
					return createChatAcceptedResponse("turn-123");
				}),
			),
		);

		await chatPage.sendMessage("Find me a deal");
		await chatPage.expectControlsDisabled();

		await chatPage.expectAssistantResponse("Working through the options...");

		sseStream.emit(
			eventFactory.create("turn.completed", {
				content: "I found 2 offers worth comparing.",
				toolCalls: [],
			}),
		);

		await chatPage.expectAssistantResponse("I found 2 offers worth comparing.");
		await chatPage.expectWaitingStateCleared();
	});
});
