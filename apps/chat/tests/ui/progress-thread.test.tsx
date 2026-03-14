import { describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ProgressThread } from "@/components/progress-thread";
import type { ToolCallViewModel } from "@/lib/chat/view-models";

function tc(
	overrides: Partial<ToolCallViewModel> &
		Pick<ToolCallViewModel, "id" | "name">,
): ToolCallViewModel {
	return { result: "", status: "completed", ...overrides };
}

function renderThread(toolCalls: ToolCallViewModel[]) {
	return render(<ProgressThread toolCalls={toolCalls} />);
}

function toolActivity() {
	return page.getByRole("region", { name: "Tool activity" });
}

function summaryButton() {
	return toolActivity().getByRole("button").first();
}

function toolList() {
	return toolActivity().getByRole("list", { name: "Tool calls" });
}

function toolItem(label: string) {
	return toolList().getByRole("listitem", { name: label });
}

async function expandThread() {
	await summaryButton().click();
}

describe("ProgressThread - collapsed summary", () => {
	test("shows 'Working...' when all tools are still running", async () => {
		renderThread([
			tc({ id: "1", name: "run_command", status: "running" }),
			tc({ id: "2", name: "read_file", status: "running" }),
		]);

		await expect.element(summaryButton()).toHaveAccessibleName("Working...");
	});

	test("shows activity summary once any tool completes", async () => {
		renderThread([
			tc({ id: "1", name: "run_command", status: "completed" }),
			tc({ id: "2", name: "read_file", status: "running" }),
		]);

		await expect
			.element(summaryButton())
			.toHaveAccessibleName("Ran a command, read a file");
	});

	test("shows summary for a single completed tool", async () => {
		renderThread([tc({ id: "1", name: "write_file", status: "completed" })]);

		await expect.element(summaryButton()).toHaveAccessibleName("Wrote a file");
	});

	test("shows plural summary for multiple same-type tools", async () => {
		renderThread([
			tc({ id: "1", name: "run_command", status: "completed" }),
			tc({ id: "2", name: "run_command", status: "completed" }),
			tc({ id: "3", name: "run_command", status: "completed" }),
		]);

		await expect
			.element(summaryButton())
			.toHaveAccessibleName("Ran 3 commands");
	});

	test("shows mixed summary for different tool types", async () => {
		renderThread([
			tc({ id: "1", name: "read_file", status: "completed" }),
			tc({ id: "2", name: "run_command", status: "completed" }),
			tc({ id: "3", name: "write_file", status: "completed" }),
			tc({
				id: "4",
				name: "inspect_background_command",
				status: "completed",
			}),
		]);

		await expect
			.element(summaryButton())
			.toHaveAccessibleName(
				"Read a file, ran a command, wrote a file, inspected a process",
			);
	});

	test("shows summary even when all tools errored", async () => {
		renderThread([
			tc({ id: "1", name: "run_command", status: "error" }),
			tc({ id: "2", name: "run_command", status: "error" }),
		]);

		await expect
			.element(summaryButton())
			.toHaveAccessibleName("Ran 2 commands");
	});
});

describe("ProgressThread - expanded thread", () => {
	test("shows formatted tool summaries when expanded", async () => {
		renderThread([
			tc({
				id: "1",
				name: "run_command",
				input: '{"command":["meridian","auth","status","--json"]}',
				result: '{"exitCode":0,"stderr":"","stdout":"ok\\n"}',
			}),
			tc({
				id: "2",
				name: "write_file",
				input: '{"path":"request.json","contents":"{}"}',
				result: '{"path":"request.json"}',
			}),
			tc({
				id: "3",
				name: "read_file",
				input: '{"path":"config.json"}',
				result: '{"port":3000}',
			}),
		]);

		await expandThread();

		await expect
			.element(toolItem("$ meridian auth status --json"))
			.toBeVisible();
		await expect.element(toolItem("write request.json")).toBeVisible();
		await expect.element(toolItem("read config.json")).toBeVisible();
	});

	test("shows human-readable labels for background command tools", async () => {
		renderThread([
			tc({
				id: "1",
				name: "inspect_background_command",
				input: '{"commandId":"abc-123-def"}',
				result: '{"status":"completed"}',
			}),
			tc({
				id: "2",
				name: "wait_for_background_command",
				input: '{"commandId":"abc-123-def"}',
				result: '{"status":"completed"}',
			}),
			tc({
				id: "3",
				name: "terminate_background_command",
				input: '{"commandId":"abc-123-def"}',
				result: '{"status":"terminated"}',
			}),
		]);

		await expandThread();

		await expect.element(toolItem("inspect background process")).toBeVisible();
		await expect.element(toolItem("await background process")).toBeVisible();
		await expect
			.element(toolItem("terminate background process"))
			.toBeVisible();
	});

	test("disables running tool rows", async () => {
		renderThread([
			tc({
				id: "1",
				name: "run_command",
				status: "completed",
				input: '{"command":["echo","done"]}',
				result: '{"exitCode":0,"stderr":"","stdout":"done"}',
			}),
			tc({
				id: "2",
				name: "run_command",
				status: "running",
				input: '{"command":["slow-cmd"]}',
			}),
		]);

		await expandThread();

		const completedRow = toolItem("$ echo done").getByRole("button");
		const runningRow = toolItem("$ slow-cmd").getByRole("button");

		await expect.element(completedRow).toBeEnabled();
		await expect.element(runningRow).toBeDisabled();
	});

	test("shows tool output when a completed tool row is clicked", async () => {
		renderThread([
			tc({
				id: "1",
				name: "run_command",
				input: '{"command":["echo","hello"]}',
				result: '{"exitCode":0,"stderr":"","stdout":"hello world\\n"}',
			}),
		]);

		await expandThread();

		const item = toolItem("$ echo hello");
		await item.getByRole("button").click();

		await expect.element(item.getByText("hello world")).toBeVisible();
	});

	test("shows stderr and non-zero exit code in output", async () => {
		renderThread([
			tc({
				id: "1",
				name: "run_command",
				input: '{"command":["failing-cmd"]}',
				result: '{"exitCode":1,"stderr":"something went wrong\\n","stdout":""}',
			}),
		]);

		await expandThread();

		const item = toolItem("$ failing-cmd");
		await item.getByRole("button").click();

		await expect.element(item.getByText("something went wrong")).toBeVisible();
		await expect.element(item.getByText("exit 1")).toBeVisible();
	});

	test("shows write_file output as 'Written to' message", async () => {
		renderThread([
			tc({
				id: "1",
				name: "write_file",
				input: '{"path":"output.txt","contents":"data"}',
				result: '{"path":"output.txt"}',
			}),
		]);

		await expandThread();

		const item = toolItem("write output.txt");
		await item.getByRole("button").click();

		await expect.element(item.getByText("Written to output.txt")).toBeVisible();
	});
});
