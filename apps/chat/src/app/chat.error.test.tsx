import { HttpResponse, http } from "msw";
import { describe } from "vitest";
import {
	createChatEventFactory,
	createControllableChatStream,
} from "../../tests/support/chat-contract";
import { test } from "../../tests/support/chat-page-fixture";
import { browserWorker, withJsonBody } from "../../tests/support/msw";

describe("Chat UI - error handling", () => {
	test("shows an interrupted assistant message when the request fails", async ({
		chatPage,
	}) => {
		browserWorker.use(
			http.post(
				"http://localhost:3201/api/chat",
				withJsonBody(
					{ message: "Trigger an error" },
					() =>
						new HttpResponse(null, {
							status: 500,
							statusText: "Server Error",
						}),
				),
			),
		);

		await chatPage.sendMessage("Trigger an error");

		await chatPage.expectAssistantResponse(
			"Something went wrong reaching the agent. Check the console for details.",
		);
		await chatPage.expectInterruptedState();
	});

	test("keeps partial streamed content visible when the stream ends before completion", async ({
		chatPage,
	}) => {
		const stream = createControllableChatStream();
		const eventFactory = createChatEventFactory();

		browserWorker.use(
			http.post(
				"http://localhost:3201/api/chat",
				withJsonBody({ message: "Start login" }, () => stream.response),
			),
		);

		await chatPage.sendMessage("Start login");
		stream.emit(
			eventFactory.create("assistant.delta", {
				delta: "Authentication started. Open the login URL in your browser.",
			}),
		);
		stream.close();

		await chatPage.expectAssistantResponse(
			"Authentication started. Open the login URL in your browser.",
		);
		await chatPage.expectInterruptedState();
	});
});
