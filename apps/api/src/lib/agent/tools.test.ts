import { afterEach, describe, expect, it, vi } from "vitest";
import { createInMemorySandboxRuntime } from "../../../tests/support/in-memory-runtime";

// biome-ignore lint/complexity/noBannedTypes: test helper for mocked langchain tools
type AnyFn = Function;

vi.mock("langchain", () => ({
	tool: (fn: AnyFn, opts: Record<string, unknown>) => {
		Object.defineProperty(fn, "name", { value: opts["name"], writable: true });
		return fn;
	},
}));

import { createRuntimeAgentTools, extractTextContent } from "@/lib/agent/tools";

function findTool(
	tools: ReturnType<typeof createRuntimeAgentTools>,
	name: string,
) {
	const t = tools.find((t) => t.name === name);
	if (!t) throw new Error(`Tool ${name} not found`);
	return t;
}

async function invokeTool(
	tool: ReturnType<typeof createRuntimeAgentTools>[number],
	input: Record<string, unknown>,
) {
	return (tool as unknown as AnyFn)(input);
}

describe("createRuntimeAgentTools", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("returns a result from the runtime", async () => {
		const runtime = createInMemorySandboxRuntime({
			files: { "test.txt": "file content" },
		});
		const tools = createRuntimeAgentTools({ runtime, sessionId: "sess-1" });

		const result = await invokeTool(findTool(tools, "read_file"), {
			path: "test.txt",
		});

		expect(result).toBe("file content");
		expect(runtime.calls).toContainEqual({
			method: "readSessionFile",
			sessionId: "sess-1",
			args: ["test.txt"],
		});
	});

	it("propagates runtime errors", async () => {
		const runtime = createInMemorySandboxRuntime();
		const tools = createRuntimeAgentTools({ runtime, sessionId: "sess-1" });

		await expect(
			invokeTool(findTool(tools, "read_file"), { path: "missing.txt" }),
		).rejects.toThrow("File not found: missing.txt");
	});

	it("passes command options through to the runtime", async () => {
		const runtime = createInMemorySandboxRuntime();
		const tools = createRuntimeAgentTools({ runtime, sessionId: "sess-1" });

		await invokeTool(findTool(tools, "run_command"), {
			command: ["ls", "-la"],
			timeoutMs: 5000,
			waitFor: "exit",
		});

		expect(runtime.calls).toContainEqual({
			method: "runCommand",
			sessionId: "sess-1",
			args: [["ls", "-la"], { timeoutMs: 5000, waitFor: "exit" }],
		});
	});

	it("creates all expected tools", () => {
		const runtime = createInMemorySandboxRuntime();
		const tools = createRuntimeAgentTools({ runtime, sessionId: "sess-1" });

		const names = tools.map((t) => t.name);
		expect(names).toEqual([
			"get_runtime_instructions",
			"run_command",
			"list_background_commands",
			"inspect_background_command",
			"wait_for_background_command",
			"terminate_background_command",
			"list_directory",
			"read_file",
			"write_file",
		]);
	});

	it("extracts visible text content without including reasoning blocks", () => {
		expect(
			extractTextContent([
				{ reasoning: "Checked auth and schema.", type: "reasoning" },
				{ text: "Please sign in and send your postcode.", type: "text" },
			]),
		).toBe("Please sign in and send your postcode.");
	});
});
