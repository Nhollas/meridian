import { test as base } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Chat } from "@/components/chat";
import { type ChatPageObject, chatPageObject } from "./chat-page-object";

export interface ChatPageFixtures {
	chatPage: ChatPageObject;
}

export const test = base.extend<ChatPageFixtures>({
	// biome-ignore lint/correctness/noEmptyPattern: Vitest fixtures require destructuring in the first parameter
	chatPage: async ({}, use) => {
		await render(<Chat />);
		await use(chatPageObject(page));
	},
});

export { expect } from "vitest";
