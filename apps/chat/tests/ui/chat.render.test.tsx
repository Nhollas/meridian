import { describe } from "vitest";
import { test } from "./chat-page-fixture";

describe("Chat UI - render", () => {
	test("shows the ready state before a conversation starts", async ({
		chatPage,
	}) => {
		await chatPage.expectReady();
	});
});
