import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "msw";
import { test as base } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Chat } from "@/components/chat";
import { createControllableSSEStream } from "./chat-contract";
import { type ChatPageObject, chatPageObject } from "./chat-page-object";
import { browserWorker } from "./msw";

export interface ChatPageFixtures {
	chatPage: ChatPageObject;
	sseStream: ReturnType<typeof createControllableSSEStream>;
}

export const test = base.extend<ChatPageFixtures>({
	// biome-ignore lint/correctness/noEmptyPattern: Vitest fixtures require destructuring in the first parameter
	sseStream: async ({}, use) => {
		const stream = createControllableSSEStream();

		browserWorker.use(
			http.get("http://localhost:3201/api/sessions/:id/events", () => {
				return stream.response;
			}),
		);

		await use(stream);
	},
	chatPage: async ({ sseStream: _sseStream }, use) => {
		const queryClient = new QueryClient();
		await render(
			<QueryClientProvider client={queryClient}>
				<Chat />
			</QueryClientProvider>,
		);
		await use(chatPageObject(page));
	},
});

export { expect } from "vitest";
