import { describe, expect, it } from "vitest";
import {
	formatActivitySummary,
	formatToolOutput,
	formatToolSummary,
} from "@/lib/chat/tool-formatting";
import type { ToolCallViewModel } from "@/lib/chat/view-models";

function toolCall(
	overrides: Partial<ToolCallViewModel> & Pick<ToolCallViewModel, "name">,
): ToolCallViewModel {
	return { id: "tc-1", result: "", status: "completed", ...overrides };
}

describe("formatToolSummary", () => {
	it("returns the display name when no input is provided", () => {
		expect(formatToolSummary("read_file")).toBe("Read File");
	});

	it("returns the raw name for unknown tools without input", () => {
		expect(formatToolSummary("unknown_tool")).toBe("unknown_tool");
	});

	it("formats run_command with a dollar prefix", () => {
		const input = JSON.stringify({ command: ["meridian", "auth", "login"] });
		expect(formatToolSummary("run_command", input)).toBe(
			"$ meridian auth login",
		);
	});

	it("formats read_file with a verb prefix", () => {
		const input = JSON.stringify({ path: "offers.json" });
		expect(formatToolSummary("read_file", input)).toBe("read offers.json");
	});

	it("formats write_file with a verb prefix", () => {
		const input = JSON.stringify({ path: "output.txt" });
		expect(formatToolSummary("write_file", input)).toBe("write output.txt");
	});

	it("formats list_directory with ls", () => {
		const input = JSON.stringify({ path: "src" });
		expect(formatToolSummary("list_directory", input)).toBe("ls src");
	});

	it("defaults list_directory to current directory", () => {
		const input = JSON.stringify({});
		expect(formatToolSummary("list_directory", input)).toBe("ls .");
	});

	it("uses a human-readable label for background commands", () => {
		const input = JSON.stringify({ commandId: "abc-123" });
		expect(formatToolSummary("inspect_background_command", input)).toBe(
			"inspect background process",
		);
		expect(formatToolSummary("wait_for_background_command", input)).toBe(
			"await background process",
		);
		expect(formatToolSummary("terminate_background_command", input)).toBe(
			"terminate background process",
		);
	});

	it("falls back to the display name on invalid JSON", () => {
		expect(formatToolSummary("read_file", "not-json")).toBe("Read File");
	});
});

describe("formatToolOutput", () => {
	it("returns empty string for empty result", () => {
		expect(formatToolOutput("run_command", "")).toBe("");
	});

	it("extracts stdout from run_command", () => {
		const result = JSON.stringify({ stdout: "hello world\n", exitCode: 0 });
		expect(formatToolOutput("run_command", result)).toBe("hello world");
	});

	it("includes stderr from run_command", () => {
		const result = JSON.stringify({
			stdout: "output\n",
			stderr: "warning\n",
			exitCode: 0,
		});
		expect(formatToolOutput("run_command", result)).toBe("output\nwarning");
	});

	it("shows exit code for non-zero run_command", () => {
		const result = JSON.stringify({
			stdout: "",
			stderr: "error\n",
			exitCode: 1,
		});
		expect(formatToolOutput("run_command", result)).toBe("error\nexit 1");
	});

	it("shows (no output) for run_command with empty stdout/stderr", () => {
		const result = JSON.stringify({ exitCode: 0 });
		expect(formatToolOutput("run_command", result)).toBe("(no output)");
	});

	it("shows file contents for write_file when input has contents", () => {
		const input = JSON.stringify({
			path: "output.txt",
			contents: '{\n  "key": "value"\n}',
		});
		const result = JSON.stringify({ path: "output.txt" });
		expect(formatToolOutput("write_file", result, input)).toBe(
			'{\n  "key": "value"\n}',
		);
	});

	it("falls back to 'Written to' for write_file without input", () => {
		const result = JSON.stringify({ path: "output.txt" });
		expect(formatToolOutput("write_file", result)).toBe(
			"Written to output.txt",
		);
	});

	it("extracts stdout from inspect_background_command", () => {
		const result = JSON.stringify({
			command: ["meridian", "auth", "login", "--json"],
			exitCode: 0,
			status: "completed",
			stdout: '{"status":"authenticated"}\n',
			stderr: "",
		});
		expect(formatToolOutput("inspect_background_command", result)).toBe(
			'{"status":"authenticated"}',
		);
	});

	it("formats list_directory entries", () => {
		const result = JSON.stringify([
			{ name: "src", type: "directory" },
			{ name: "package.json", type: "file" },
		]);
		expect(formatToolOutput("list_directory", result)).toBe(
			"src/  package.json",
		);
	});

	it("returns raw text for non-JSON results like read_file", () => {
		expect(formatToolOutput("read_file", "file contents here")).toBe(
			"file contents here",
		);
	});

	it("pretty-prints JSON for unknown tool types", () => {
		const result = JSON.stringify({ key: "value" });
		expect(formatToolOutput("unknown_tool", result)).toBe(
			JSON.stringify({ key: "value" }, null, 2),
		);
	});
});

describe("formatActivitySummary", () => {
	it("returns 'No actions' for an empty array", () => {
		expect(formatActivitySummary([])).toBe("No actions");
	});

	it("uses singular form for a single tool call", () => {
		expect(formatActivitySummary([toolCall({ name: "read_file" })])).toBe(
			"Read a file",
		);
	});

	it("uses plural form with count for multiple same-type calls", () => {
		expect(
			formatActivitySummary([
				toolCall({ id: "1", name: "run_command" }),
				toolCall({ id: "2", name: "run_command" }),
				toolCall({ id: "3", name: "run_command" }),
			]),
		).toBe("Ran 3 commands");
	});

	it("joins multiple tool types with commas", () => {
		expect(
			formatActivitySummary([
				toolCall({ id: "1", name: "read_file" }),
				toolCall({ id: "2", name: "run_command" }),
				toolCall({ id: "3", name: "write_file" }),
			]),
		).toBe("Read a file, ran a command, wrote a file");
	});

	it("handles mixed counts across tool types", () => {
		expect(
			formatActivitySummary([
				toolCall({ id: "1", name: "read_file" }),
				toolCall({ id: "2", name: "read_file" }),
				toolCall({ id: "3", name: "run_command" }),
			]),
		).toBe("Read 2 files, ran a command");
	});

	it("falls back to display name for unknown tools", () => {
		expect(formatActivitySummary([toolCall({ name: "custom_tool" })])).toBe(
			"Used custom_tool",
		);
	});

	it("appends count suffix for multiple unknown tool calls", () => {
		expect(
			formatActivitySummary([
				toolCall({ id: "1", name: "custom_tool" }),
				toolCall({ id: "2", name: "custom_tool" }),
			]),
		).toBe("Used custom_tool 2×");
	});
});
