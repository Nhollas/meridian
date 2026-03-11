import { http } from "msw";
import { describe } from "vitest";
import {
	createChatEventFactory,
	createControllableChatStream,
} from "./chat-contract";
import { test } from "./chat-page-fixture";
import { browserWorker } from "./msw";

describe("Chat UI - loading state", () => {
	test("disables controls while a chat request is still streaming", async ({
		chatPage,
	}) => {
		const stream = createControllableChatStream();
		const eventFactory = createChatEventFactory();

		browserWorker.use(http.post("/api/chat", () => stream.response));

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
