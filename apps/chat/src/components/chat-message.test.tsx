import { describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ChatMessage } from "@/components/chat-message";
import type { ChatMessageViewModel } from "@/lib/view-models";

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

function userArticle() {
	return page.getByRole("article", { name: "User message" });
}

function assistantArticle() {
	return page.getByRole("article", { name: "Assistant message" });
}

function toolActivity() {
	return assistantArticle().getByRole("region", { name: "Tool activity" });
}

describe("ChatMessage - user messages", () => {
	test("renders user message content inside the user bubble", async () => {
		render(
			<ChatMessage message={userMessage({ content: "Find me a deal" })} />,
		);

		await expect
			.element(userArticle().getByText("Find me a deal"))
			.toBeVisible();
	});

	test("renders as a user message article", async () => {
		render(<ChatMessage message={userMessage()} />);

		await expect.element(userArticle()).toBeVisible();
	});

	test("shows timestamp inside the user message", async () => {
		render(
			<ChatMessage
				message={userMessage({ timestamp: "2026-03-14T14:30:00.000Z" })}
			/>,
		);

		await expect.element(userArticle().getByText("14:30")).toBeVisible();
	});
});

describe("ChatMessage - assistant messages", () => {
	test("renders Meridian label in the assistant message", async () => {
		render(<ChatMessage message={assistantMessage()} />);

		await expect
			.element(assistantArticle().getByText("Meridian"))
			.toBeVisible();
	});

	test("renders response content inside the assistant article", async () => {
		render(<ChatMessage message={assistantMessage()} />);

		await expect
			.element(assistantArticle().getByText("I can help with that."))
			.toBeVisible();
	});

	test("renders markdown content in assistant messages", async () => {
		render(
			<ChatMessage
				message={assistantMessage({
					content:
						"Here are the results:\n\n- **TalkTalk** at £26/mo\n- **Sky** at £33/mo",
				})}
			/>,
		);

		await expect
			.element(assistantArticle().getByText("TalkTalk"))
			.toBeVisible();
		await expect.element(assistantArticle().getByText("Sky")).toBeVisible();
	});

	test("shows streaming indicator in the assistant message", async () => {
		render(
			<ChatMessage
				message={assistantMessage({
					status: "streaming",
					content: "Working on it...",
				})}
			/>,
		);

		await expect
			.element(assistantArticle().getByText("Streaming"))
			.toBeVisible();
	});

	test("shows interrupted label in the assistant message", async () => {
		render(
			<ChatMessage
				message={assistantMessage({
					status: "error",
					content: "Something went wrong.",
				})}
			/>,
		);

		await expect
			.element(assistantArticle().getByText("Interrupted"))
			.toBeVisible();
	});

	test("renders tool activity inside the assistant message", async () => {
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

		const summary = toolActivity().getByRole("button").first();
		await expect
			.element(summary)
			.toHaveAccessibleName("Ran a command, wrote a file");
	});

	test("shows working state in tool activity during streaming", async () => {
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

		const summary = toolActivity().getByRole("button").first();
		await expect.element(summary).toHaveAccessibleName("Working...");
	});
});
