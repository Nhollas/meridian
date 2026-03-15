import type { RuntimeEventEnvelope } from "@meridian/contracts/runtime-events";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "msw";
import { test as base } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Chat } from "@/components/chat";
import {
	createChatAcceptedResponse,
	createControllableSSEStream,
} from "./chat-contract";
import { type ChatPageObject, chatPageObject } from "./chat-page-object";
import { browserWorker, withJsonBody } from "./msw";

export interface ChatPageFixtures {
	chatPage: ChatPageObject;
	sseStream: {
		emit: (event: RuntimeEventEnvelope) => void;
		close: () => void;
	};
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

		await use({ emit: stream.emit, close: stream.close });
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

export function withChatResponse(
	message: string,
	sseStream: ChatPageFixtures["sseStream"],
	events: RuntimeEventEnvelope[],
	turnId = "turn-123",
) {
	browserWorker.use(
		http.post(
			"http://localhost:3201/api/chat",
			withJsonBody({ message }, () => {
				queueMicrotask(() => {
					for (const event of events) {
						sseStream.emit(event);
					}
				});
				return createChatAcceptedResponse(turnId);
			}),
		),
	);
}

export { expect } from "vitest";
