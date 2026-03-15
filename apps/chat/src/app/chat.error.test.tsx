import { HttpResponse, http } from "msw";
import { describe } from "vitest";
import { test, withChatTurn } from "../../tests/support/chat-page-fixture";
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

	test("shows error when turn fails via SSE", async ({
		chatPage,
		sseStream,
	}) => {
		withChatTurn("Start login", sseStream, (factory) => [
			factory.create("assistant.delta", {
				delta: "Authentication started. Open the login URL in your browser.",
			}),
			factory.create("turn.failed", {
				error: "device flow requires user interaction",
			}),
		]);

		await chatPage.sendMessage("Start login");

		await chatPage.expectAssistantResponse(
			"Authentication started. Open the login URL in your browser.",
		);
		await chatPage.expectInterruptedState();
	});
});
