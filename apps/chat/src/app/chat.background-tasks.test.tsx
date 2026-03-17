import { describe } from "vitest";
import { createChatEventFactory } from "../../tests/support/chat-contract";
import { expect, test } from "../../tests/support/chat-page-fixture";

describe("Chat UI - background tasks", () => {
	test("shows a running background task when started event is received", async ({
		chatPage,
		sseStream,
	}) => {
		const events = createChatEventFactory({ turnId: "turn-1" });

		await chatPage.expectReady();

		// Panel is always visible, even when empty
		await chatPage.expectBackgroundTaskPanelVisible();

		sseStream.emit(
			events.create("background_task.started", {
				taskId: "task-1",
				label: "Logging into MoneySupermarket",
				startedAt: "2026-03-10T12:00:00.000Z",
			}),
		);

		await chatPage.expectBackgroundTask("Logging into MoneySupermarket");

		// Verify running status dot is shown
		const task = chatPage.getBackgroundTask("Logging into MoneySupermarket");
		await expect
			.element(task.getByRole("img", { name: "Running" }))
			.toBeVisible();
	});

	test("updates task to completed status and auto-dismisses after 4 seconds", async ({
		chatPage,
		sseStream,
	}) => {
		const events = createChatEventFactory({ turnId: "turn-1" });

		await chatPage.expectReady();

		sseStream.emit(
			events.create("background_task.started", {
				taskId: "task-1",
				label: "Logging into Sky",
				startedAt: "2026-03-10T12:00:00.000Z",
			}),
		);

		await chatPage.expectBackgroundTask("Logging into Sky");

		sseStream.emit(
			events.create("background_task.completed", {
				taskId: "task-1",
				status: "completed",
				endedAt: "2026-03-10T12:00:05.000Z",
			}),
		);

		// Task is visible immediately after completion with completed status
		const task = chatPage.getBackgroundTask("Logging into Sky");
		await expect
			.element(task.getByRole("img", { name: "Completed" }))
			.toBeVisible();

		// Auto-dismisses after 4 seconds
		await chatPage.expectNoBackgroundTask("Logging into Sky");
	}, 10_000);

	test("shows multiple concurrent background tasks", async ({
		chatPage,
		sseStream,
	}) => {
		const events = createChatEventFactory({ turnId: "turn-1" });

		await chatPage.expectReady();

		sseStream.emit(
			events.create("background_task.started", {
				taskId: "task-1",
				label: "Logging into Sky",
				startedAt: "2026-03-10T12:00:00.000Z",
			}),
		);
		sseStream.emit(
			events.create("background_task.started", {
				taskId: "task-2",
				label: "Logging into MoneySupermarket",
				startedAt: "2026-03-10T12:00:01.000Z",
			}),
		);
		sseStream.emit(
			events.create("background_task.started", {
				taskId: "task-3",
				label: "Logging into CompareTheMarket",
				startedAt: "2026-03-10T12:00:02.000Z",
			}),
		);

		await chatPage.expectBackgroundTask("Logging into Sky");
		await chatPage.expectBackgroundTask("Logging into MoneySupermarket");
		await chatPage.expectBackgroundTask("Logging into CompareTheMarket");
	});

	test("shows failed task with error status", async ({
		chatPage,
		sseStream,
	}) => {
		const events = createChatEventFactory({ turnId: "turn-1" });

		await chatPage.expectReady();

		sseStream.emit(
			events.create("background_task.started", {
				taskId: "task-1",
				label: "Logging into Sky",
				startedAt: "2026-03-10T12:00:00.000Z",
			}),
		);

		sseStream.emit(
			events.create("background_task.completed", {
				taskId: "task-1",
				status: "failed",
				endedAt: "2026-03-10T12:00:03.000Z",
			}),
		);

		const task = chatPage.getBackgroundTask("Logging into Sky");
		await expect
			.element(task.getByRole("img", { name: "Error" }))
			.toBeVisible();
	});
});
