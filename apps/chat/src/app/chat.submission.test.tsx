import { HttpResponse, http } from "msw";
import { describe } from "vitest";
import { test } from "../../tests/support/chat-page-fixture";
import {
	browserWorker,
	withHeaders,
	withJsonBody,
} from "../../tests/support/msw";

describe("Chat UI - submission and streaming", () => {
	test("submits a message and renders streamed contract events", async ({
		chatPage,
		sseStream,
	}) => {
		browserWorker.use(
			http.post(
				"http://localhost:3201/api/chat",
				withJsonBody(
					{ message: "Find me a deal" },
					withHeaders(
						(headers) =>
							headers.get("content-type") === "application/json" &&
							headers.has("session-id"),
						async ({ request }) => {
							const body = (await request.clone().json()) as {
								turnId?: string;
							};
							const turnId = body.turnId ?? "turn-fallback";

							const { createChatEventFactory } = await import(
								"../../tests/support/chat-contract"
							);
							const factory = createChatEventFactory({ turnId });

							queueMicrotask(() => {
								sseStream.emit(
									factory.create("assistant.delta", {
										delta: "Working through the options...",
									}),
								);
								sseStream.emit(
									factory.create("tool.completed", {
										toolCall: {
											id: "tool-1",
											input: '{"path":"offers.json"}',
											name: "read_file",
											output: '{"offers":2}',
										},
									}),
								);
								sseStream.emit(
									factory.create("turn.completed", {
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
							return HttpResponse.json({ turnId }, { status: 202 });
						},
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
