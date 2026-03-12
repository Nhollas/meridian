import { HttpResponse, http } from "msw";
import { describe, vi } from "vitest";
import {
	createChatEventFactory,
	createControllableChatStream,
} from "./chat-contract";
import { test } from "./chat-page-fixture";
import { browserWorker } from "./msw";

describe("Chat UI - error handling", () => {
	test("shows an interrupted assistant message when the request fails", async ({
		chatPage,
	}) => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		browserWorker.use(
			http.post(
				"http://localhost:3201/api/chat",
				() =>
					new HttpResponse(null, { status: 500, statusText: "Server Error" }),
			),
		);

		await chatPage.sendMessage("Trigger an error");

		await chatPage.expectAssistantResponse(
			"Something went wrong reaching the agent. Check the console for details.",
		);
		await chatPage.expectInterruptedState();

		consoleError.mockRestore();
	});

	test("keeps partial streamed content visible when the stream ends before completion", async ({
		chatPage,
	}) => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const stream = createControllableChatStream();
		const eventFactory = createChatEventFactory();

		browserWorker.use(
			http.post("http://localhost:3201/api/chat", () => stream.response),
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

		consoleError.mockRestore();
	});
});
