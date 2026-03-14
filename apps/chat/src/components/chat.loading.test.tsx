import { http } from "msw";
import { describe } from "vitest";
import {
	createChatEventFactory,
	createControllableChatStream,
} from "../../tests/support/chat-contract";
import { test } from "../../tests/support/chat-page-fixture";
import { browserWorker } from "../../tests/support/msw";
import { withJsonBody } from "../../tests/support/msw-predicates";

describe("Chat UI - loading state", () => {
	test("disables controls while a chat request is still streaming", async ({
		chatPage,
	}) => {
		const stream = createControllableChatStream();
		const eventFactory = createChatEventFactory();

		browserWorker.use(
			http.post(
				"http://localhost:3201/api/chat",
				withJsonBody({ message: "Find me a deal" }, () => stream.response),
			),
		);

		await chatPage.sendMessage("Find me a deal");
		await chatPage.expectControlsDisabled();

		stream.emit(
			eventFactory.create("assistant.delta", {
				delta: "Working through the options...",
			}),
		);
		await chatPage.expectAssistantResponse("Working through the options...");

		stream.emit(
			eventFactory.create("turn.completed", {
				content: "I found 2 offers worth comparing.",
				toolCalls: [],
			}),
		);
		stream.close();

		await chatPage.expectAssistantResponse("I found 2 offers worth comparing.");
		await chatPage.expectWaitingStateCleared();
	});
});
