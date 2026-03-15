import type { RuntimeEventEnvelope } from "@meridian/contracts/runtime-events";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HttpResponse, http } from "msw";
import { test as base } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Chat } from "@/components/chat";
import {
	createChatEventFactory,
	createControllableSSEStream,
} from "./chat-contract";
import { type ChatPageObject, chatPageObject } from "./chat-page-object";
import { browserWorker, withJsonBody } from "./msw";

export type ChatEventFactory = ReturnType<typeof createChatEventFactory>;

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

/**
 * Registers an MSW handler that intercepts a POST /api/chat for the given
 * message, extracts the client-generated turnId, creates events using that
 * turnId, emits them on the SSE stream, and returns 202.
 */
export function withChatTurn(
	message: string,
	sseStream: ChatPageFixtures["sseStream"],
	createEvents: (factory: ChatEventFactory) => RuntimeEventEnvelope[],
) {
	browserWorker.use(
		http.post(
			"http://localhost:3201/api/chat",
			withJsonBody({ message }, async ({ request }) => {
				const body = (await request.clone().json()) as {
					turnId?: string;
				};
				const turnId = body.turnId ?? "turn-fallback";
				const factory = createChatEventFactory({ turnId });
				const events = createEvents(factory);
				queueMicrotask(() => {
					for (const event of events) {
						sseStream.emit(event);
					}
				});
				return HttpResponse.json({ turnId }, { status: 202 });
			}),
		),
	);
}

export { expect } from "vitest";
