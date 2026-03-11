import { expect } from "vitest";
import type { BrowserPage } from "vitest/browser";

export type ChatPageObject = ReturnType<typeof chatPageObject>;

export function chatPageObject(page: BrowserPage) {
	const self = {
		getAssistantMessage: (text: string) =>
			self
				.getConversation()
				.getByRole("article", { name: "Assistant message" })
				.filter({ hasText: text }),
		getConversation: () => page.getByRole("log", { name: "Conversation" }),
		getCopyTraceButton: () =>
			page.getByRole("button", { name: "Copy Debug Trace" }),
		getDownloadJsonButton: () =>
			page.getByRole("button", { name: "Download JSON" }),
		getInterruptedBadge: () =>
			self
				.getConversation()
				.getByRole("article", { name: "Assistant message" })
				.filter({ hasText: "Interrupted" }),
		getMessageInput: () =>
			page.getByRole("textbox", { name: "Message Meridian" }),
		getSendButton: () => page.getByRole("button", { name: "Send message" }),
		getSlowStreamButton: () =>
			page.getByRole("button", { name: "Slow Stream" }),
		getToolCall: (name: string) =>
			self.getConversation().getByRole("group", { name: `Tool call ${name}` }),
		getUserMessage: (text: string) =>
			self
				.getConversation()
				.getByRole("article", { name: "User message" })
				.filter({ hasText: text }),
		getWelcomeHeading: () =>
			page.getByRole("heading", { name: "Meridian Agent" }),

		expectAssistantResponse: async (text: string) => {
			await expect.element(self.getAssistantMessage(text)).toBeVisible();
		},

		expectControlsDisabled: async () => {
			await expect.element(self.getMessageInput()).toBeDisabled();
			await expect.element(self.getSendButton()).toBeDisabled();
		},

		expectInterruptedState: async () => {
			await expect.element(self.getInterruptedBadge()).toBeVisible();
		},

		expectMessageInputValue: async (value: string) => {
			await expect.element(self.getMessageInput()).toHaveValue(value);
		},

		expectReady: async () => {
			await expect.element(self.getMessageInput()).toBeEnabled();
			await expect.element(self.getSendButton()).toBeDisabled();
			await expect.element(self.getWelcomeHeading()).toBeVisible();
			await expect.element(self.getCopyTraceButton()).toBeVisible();
			await expect.element(self.getDownloadJsonButton()).toBeVisible();
			await expect.element(self.getSlowStreamButton()).toBeVisible();
		},

		expectToolCallVisible: async (name: string) => {
			await expect.element(self.getToolCall(name)).toBeVisible();
		},

		expectUserMessage: async (text: string) => {
			await expect.element(self.getUserMessage(text)).toBeVisible();
		},

		expectWaitingStateCleared: async () => {
			await expect.element(self.getMessageInput()).toBeEnabled();
		},

		sendMessage: async (message: string) => {
			await self.getMessageInput().fill(message);
			await self.getSendButton().click();
		},

		toggleSlowStream: async () => {
			await self.getSlowStreamButton().click();
		},
	};

	return Object.assign(page, self);
}
