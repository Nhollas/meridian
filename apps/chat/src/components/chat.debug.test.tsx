import { http } from "msw";
import { describe, expect, vi } from "vitest";
import {
	createChatEventFactory,
	createChatStreamResponse,
} from "../../tests/support/chat-contract";
import { test } from "../../tests/support/chat-page-fixture";
import { browserWorker } from "../../tests/support/msw";
import { withHeaders, withJsonBody } from "../../tests/support/msw-predicates";

describe("Chat UI - debug controls", () => {
	test("sends the debug delay header when slow stream mode is enabled", async ({
		chatPage,
	}) => {
		const eventFactory = createChatEventFactory();

		browserWorker.use(
			http.post(
				"http://localhost:3201/api/chat",
				withHeaders(
					(headers) => headers.get("meridian-debug-stream-delay-ms") === "120",
					() =>
						createChatStreamResponse([
							eventFactory.create("turn.completed", {
								content: "Done.",
								toolCalls: [],
							}),
						]),
				),
			),
		);

		await chatPage.toggleSlowStream();
		await chatPage.sendMessage("Enable slow mode");
		await chatPage.expectAssistantResponse("Done.");
	});

	test("copies a compact debug trace with conversation messages and tool calls", async ({
		chatPage,
	}) => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		const eventFactory = createChatEventFactory();

		Object.defineProperty(window.navigator, "clipboard", {
			configurable: true,
			value: {
				writeText,
			},
		});

		browserWorker.use(
			http.post(
				"http://localhost:3201/api/chat",
				withJsonBody({ message: "Find me a deal" }, () =>
					createChatStreamResponse([
						eventFactory.create("assistant.delta", {
							delta: "Working through the options...",
						}),
						eventFactory.create("tool.completed", {
							toolCall: {
								id: "tool-1",
								input: '{"path":"offers.json"}',
								name: "read_file",
								output: '{"offers":2}',
							},
						}),
						eventFactory.create("turn.completed", {
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
					]),
				),
			),
		);

		await chatPage.sendMessage("Find me a deal");
		await chatPage.expectAssistantResponse("I found 2 offers worth comparing.");
		await chatPage.openDebugPanel();
		await chatPage.getCopyTraceButton().click();

		expect(writeText).toHaveBeenCalledTimes(1);

		const copiedTrace = JSON.parse(writeText.mock.calls[0]?.[0] ?? "null");
		expect(copiedTrace).toMatchObject({
			sessionId: expect.any(String),
			messages: [
				{
					content: "Find me a deal",
					role: "user",
				},
				{
					content: "I found 2 offers worth comparing.",
					role: "assistant",
					toolCalls: [
						{
							id: "tool-1",
							input: '{"path":"offers.json"}',
							name: "read_file",
							result: '{"offers":2}',
							status: "completed",
						},
					],
				},
			],
		});
		expect(copiedTrace).not.toHaveProperty("turnLogs");
	});

	test("downloads a compact debug trace with conversation messages and tool calls", async ({
		chatPage,
	}) => {
		const createObjectUrl = vi
			.spyOn(URL, "createObjectURL")
			.mockReturnValue("blob:trace");
		const revokeObjectUrl = vi
			.spyOn(URL, "revokeObjectURL")
			.mockImplementation(() => {});
		const anchorClick = vi
			.spyOn(HTMLAnchorElement.prototype, "click")
			.mockImplementation(() => {});
		const eventFactory = createChatEventFactory();

		browserWorker.use(
			http.post(
				"http://localhost:3201/api/chat",
				withJsonBody({ message: "Find me a deal" }, () =>
					createChatStreamResponse([
						eventFactory.create("assistant.delta", {
							delta: "Working through the options...",
						}),
						eventFactory.create("tool.completed", {
							toolCall: {
								id: "tool-1",
								input: '{"path":"offers.json"}',
								name: "read_file",
								output: '{"offers":2}',
							},
						}),
						eventFactory.create("turn.completed", {
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
					]),
				),
			),
		);

		await chatPage.sendMessage("Find me a deal");
		await chatPage.expectAssistantResponse("I found 2 offers worth comparing.");
		await chatPage.openDebugPanel();
		await chatPage.getDownloadJsonButton().click();

		expect(createObjectUrl).toHaveBeenCalledTimes(1);
		expect(anchorClick).toHaveBeenCalledTimes(1);
		expect(revokeObjectUrl).toHaveBeenCalledWith("blob:trace");

		const exportedBlob = createObjectUrl.mock.calls[0]?.[0];
		expect(exportedBlob).toBeInstanceOf(Blob);
		if (!(exportedBlob instanceof Blob)) {
			throw new Error("Expected debug trace download to be a Blob");
		}

		const downloadedTrace = JSON.parse(await exportedBlob.text());
		expect(downloadedTrace).toMatchObject({
			sessionId: expect.any(String),
			messages: [
				{
					content: "Find me a deal",
					role: "user",
				},
				{
					content: "I found 2 offers worth comparing.",
					role: "assistant",
					toolCalls: [
						{
							id: "tool-1",
							input: '{"path":"offers.json"}',
							name: "read_file",
							result: '{"offers":2}',
							status: "completed",
						},
					],
				},
			],
		});
		expect(downloadedTrace).not.toHaveProperty("turnLogs");
	});
});
