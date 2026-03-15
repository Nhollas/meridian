import { HttpResponse, http } from "msw";
import { describe } from "vitest";
import { createChatEventFactory } from "../../tests/support/chat-contract";
import { test } from "../../tests/support/chat-page-fixture";
import { browserWorker, withJsonBody } from "../../tests/support/msw";

describe("Chat UI - loading state", () => {
	test("disables controls while a chat request is still streaming", async ({
		chatPage,
		sseStream,
	}) => {
		let turnFactory: ReturnType<typeof createChatEventFactory> | null = null;

		browserWorker.use(
			http.post(
				"http://localhost:3201/api/chat",
				withJsonBody({ message: "Find me a deal" }, async ({ request }) => {
					const body = (await request.clone().json()) as {
						turnId?: string;
					};
					const turnId = body.turnId ?? "turn-fallback";
					turnFactory = createChatEventFactory({ turnId });

					queueMicrotask(() => {
						sseStream.emit(
							turnFactory!.create("assistant.delta", {
								delta: "Working through the options...",
							}),
						);
					});
					return HttpResponse.json({ turnId }, { status: 202 });
				}),
			),
		);

		await chatPage.sendMessage("Find me a deal");
		await chatPage.expectControlsDisabled();
		await chatPage.expectAssistantResponse("Working through the options...");

		sseStream.emit(
			turnFactory!.create("turn.completed", {
				content: "I found 2 offers worth comparing.",
				toolCalls: [],
			}),
		);

		await chatPage.expectAssistantResponse("I found 2 offers worth comparing.");
		await chatPage.expectWaitingStateCleared();
	});
});
