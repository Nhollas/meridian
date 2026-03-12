import { http } from "msw";
import { describe, expect } from "vitest";
import {
	createChatEventFactory,
	createChatStreamResponse,
} from "./chat-contract";
import { test } from "./chat-page-fixture";
import { browserWorker } from "./msw";

describe("Chat UI - debug controls", () => {
	test("sends the debug delay header when slow stream mode is enabled", async ({
		chatPage,
	}) => {
		let requestHeaders: Record<string, string> | null = null;
		const eventFactory = createChatEventFactory();

		browserWorker.use(
			http.post("http://localhost:3201/api/chat", ({ request }) => {
				requestHeaders = Object.fromEntries(request.headers.entries());

				return createChatStreamResponse([
					eventFactory.create("turn.completed", {
						content: "Done.",
						toolCalls: [],
					}),
				]);
			}),
		);

		await chatPage.toggleSlowStream();
		await chatPage.sendMessage("Enable slow mode");
		await chatPage.expectAssistantResponse("Done.");

		expect(requestHeaders).toMatchObject({
			"x-meridian-debug-stream-delay-ms": "120",
		});
	});
});
