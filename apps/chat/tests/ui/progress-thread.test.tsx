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

async function expandThread() {
	const summary = page.getByRole("button").first();
	await summary.click();
}

describe("ProgressThread - collapsed summary", () => {
	test("shows 'Working...' when all tools are still running", async () => {
		renderThread([
			tc({ id: "1", name: "run_command", status: "running" }),
			tc({ id: "2", name: "read_file", status: "running" }),
		]);

		await expect.element(page.getByText("Working...")).toBeVisible();
	});

	test("shows activity summary once any tool completes", async () => {
		renderThread([
			tc({ id: "1", name: "run_command", status: "completed" }),
			tc({ id: "2", name: "read_file", status: "running" }),
		]);

		await expect
			.element(page.getByText("Ran a command, read a file"))
			.toBeVisible();
	});

	test("shows summary for a single completed tool", async () => {
		renderThread([tc({ id: "1", name: "write_file", status: "completed" })]);

		await expect.element(page.getByText("Wrote a file")).toBeVisible();
	});

	test("shows plural summary for multiple same-type tools", async () => {
		renderThread([
			tc({ id: "1", name: "run_command", status: "completed" }),
			tc({ id: "2", name: "run_command", status: "completed" }),
			tc({ id: "3", name: "run_command", status: "completed" }),
		]);

		await expect.element(page.getByText("Ran 3 commands")).toBeVisible();
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
			.element(
				page.getByText(
					"Read a file, ran a command, wrote a file, inspected a process",
				),
			)
			.toBeVisible();
	});

	test("shows summary even when all tools errored", async () => {
		renderThread([
			tc({ id: "1", name: "run_command", status: "error" }),
			tc({ id: "2", name: "run_command", status: "error" }),
		]);

		await expect.element(page.getByText("Ran 2 commands")).toBeVisible();
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
			.element(page.getByText("$ meridian auth status --json"))
			.toBeVisible();
		await expect.element(page.getByText("write request.json")).toBeVisible();
		await expect.element(page.getByText("read config.json")).toBeVisible();
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

		await expect
			.element(page.getByText("inspect background process"))
			.toBeVisible();
		await expect
			.element(page.getByText("await background process"))
			.toBeVisible();
		await expect
			.element(page.getByText("terminate background process"))
			.toBeVisible();
	});

	test("disables running tool rows", async () => {
		renderThread([
			tc({
				id: "1",
				name: "run_command",
				status: "completed",
				result: '{"exitCode":0,"stderr":"","stdout":"done"}',
			}),
			tc({ id: "2", name: "run_command", status: "running" }),
		]);

		await expandThread();

		const buttons = page.getByRole("listitem").getByRole("button");
		await expect.element(buttons.nth(0)).toBeEnabled();
		await expect.element(buttons.nth(1)).toBeDisabled();
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

		// Click the tool row to expand output
		await page.getByText("$ echo hello").click();
		await expect.element(page.getByText("hello world")).toBeVisible();
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
		await page.getByText("$ failing-cmd").click();

		await expect.element(page.getByText("something went wrong")).toBeVisible();
		await expect.element(page.getByText("exit 1")).toBeVisible();
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
		await page.getByText("write output.txt").click();

		await expect.element(page.getByText("Written to output.txt")).toBeVisible();
	});
});
