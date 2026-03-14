import { describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ChatMessage } from "@/components/chat-message";
import type { ChatMessageViewModel } from "@/lib/chat/view-models";

function userMessage(
	overrides?: Partial<ChatMessageViewModel>,
): ChatMessageViewModel {
	return {
		id: "msg-1",
		role: "user",
		content: "Hello there",
		timestamp: "2026-03-14T09:00:00.000Z",
		...overrides,
	};
}

function assistantMessage(
	overrides?: Partial<ChatMessageViewModel>,
): ChatMessageViewModel {
	return {
		id: "msg-2",
		role: "assistant",
		content: "I can help with that.",
		timestamp: "2026-03-14T09:00:01.000Z",
		...overrides,
	};
}

describe("ChatMessage - user messages", () => {
	test("renders user message with content", async () => {
		render(
			<ChatMessage message={userMessage({ content: "Find me a deal" })} />,
		);

		await expect.element(page.getByText("Find me a deal")).toBeVisible();
	});

	test("renders user message as right-aligned bubble", async () => {
		render(<ChatMessage message={userMessage()} />);

		const article = page.getByRole("article", { name: "User message" });
		await expect.element(article).toBeVisible();
	});

	test("shows timestamp on user message", async () => {
		render(
			<ChatMessage
				message={userMessage({ timestamp: "2026-03-14T14:30:00.000Z" })}
			/>,
		);

		await expect.element(page.getByText("14:30")).toBeVisible();
	});

	test("preserves whitespace in user messages", async () => {
		render(
			<ChatMessage
				message={userMessage({ content: "Line 1\nLine 2\nLine 3" })}
			/>,
		);

		await expect.element(page.getByText("Line 1")).toBeVisible();
	});
});

describe("ChatMessage - assistant messages", () => {
	test("renders assistant message with Meridian label", async () => {
		render(<ChatMessage message={assistantMessage()} />);

		await expect.element(page.getByText("Meridian")).toBeVisible();
		await expect.element(page.getByText("I can help with that.")).toBeVisible();
	});

	test("renders markdown in assistant messages", async () => {
		render(
			<ChatMessage
				message={assistantMessage({
					content:
						"Here are the results:\n\n- **TalkTalk** at £26/mo\n- **Sky** at £33/mo",
				})}
			/>,
		);

		await expect.element(page.getByText("TalkTalk")).toBeVisible();
		await expect.element(page.getByText("Sky")).toBeVisible();
	});

	test("shows streaming indicator when status is streaming", async () => {
		render(
			<ChatMessage
				message={assistantMessage({
					status: "streaming",
					content: "Working on it...",
				})}
			/>,
		);

		await expect.element(page.getByText("Streaming")).toBeVisible();
	});

	test("shows interrupted label when status is error", async () => {
		render(
			<ChatMessage
				message={assistantMessage({
					status: "error",
					content: "Something went wrong.",
				})}
			/>,
		);

		await expect.element(page.getByText("Interrupted")).toBeVisible();
	});

	test("renders tool calls via progress thread", async () => {
		render(
			<ChatMessage
				message={assistantMessage({
					toolCalls: [
						{
							id: "tc-1",
							name: "run_command",
							input: '{"command":["meridian","--help"]}',
							result: '{"exitCode":0,"stderr":"","stdout":"usage info"}',
							status: "completed",
						},
						{
							id: "tc-2",
							name: "write_file",
							input: '{"path":"data.json","contents":"{}"}',
							result: '{"path":"data.json"}',
							status: "completed",
						},
					],
				})}
			/>,
		);

		await expect
			.element(page.getByText("Ran a command, wrote a file"))
			.toBeVisible();
	});

	test("renders assistant message without content during streaming", async () => {
		render(
			<ChatMessage
				message={assistantMessage({
					status: "streaming",
					content: "",
					toolCalls: [
						{
							id: "tc-1",
							name: "run_command",
							status: "running",
							result: "",
						},
					],
				})}
			/>,
		);

		await expect.element(page.getByText("Working...")).toBeVisible();
		await expect.element(page.getByText("Streaming")).toBeVisible();
	});
});
