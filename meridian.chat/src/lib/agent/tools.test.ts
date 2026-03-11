import { afterEach, describe, expect, it, vi } from "vitest";
import type { SandboxRuntime } from "@/lib/sandbox/runtime";

// biome-ignore lint/complexity/noBannedTypes: test helper for mocked langchain tools
type AnyFn = Function;

vi.mock("langchain", () => ({
	tool: (fn: AnyFn, opts: Record<string, unknown>) => {
		Object.defineProperty(fn, "name", { value: opts["name"], writable: true });
		return fn;
	},
}));

import { createRuntimeAgentTools } from "@/lib/agent/tools";

function createMockRuntime(): SandboxRuntime {
	return {
		createSession: vi.fn(),
		deleteSessionFile: vi.fn(),
		destroySession: vi.fn(),
		getBackgroundCommand: vi.fn().mockResolvedValue({}),
		getInstructions: vi.fn().mockResolvedValue("runtime instructions"),
		listBackgroundCommands: vi.fn().mockResolvedValue([]),
		listSessionFiles: vi.fn().mockResolvedValue([]),
		readSessionFile: vi.fn().mockResolvedValue("file content"),
		runCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "ok" }),
		terminateBackgroundCommand: vi.fn().mockResolvedValue({}),
		waitForBackgroundCommand: vi.fn().mockResolvedValue({}),
		writeSessionFile: vi.fn().mockResolvedValue("/workspace/test.txt"),
	} as unknown as SandboxRuntime;
}

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
		const runtime = createMockRuntime();
		const tools = createRuntimeAgentTools({ runtime, sessionId: "sess-1" });

		const result = await invokeTool(findTool(tools, "read_file"), {
			path: "test.txt",
		});

		expect(result).toBe("file content");
		expect(runtime.readSessionFile).toHaveBeenCalledWith("sess-1", "test.txt");
	});

	it("propagates runtime errors", async () => {
		const runtime = createMockRuntime();
		vi.mocked(runtime.readSessionFile).mockRejectedValue(
			new Error("not found"),
		);
		const tools = createRuntimeAgentTools({ runtime, sessionId: "sess-1" });

		await expect(
			invokeTool(findTool(tools, "read_file"), { path: "missing.txt" }),
		).rejects.toThrow("not found");
	});

	it("passes command options through to the runtime", async () => {
		const runtime = createMockRuntime();
		const tools = createRuntimeAgentTools({ runtime, sessionId: "sess-1" });

		await invokeTool(findTool(tools, "run_command"), {
			command: ["ls", "-la"],
			timeoutMs: 5000,
			waitFor: "exit",
		});

		expect(runtime.runCommand).toHaveBeenCalledWith("sess-1", ["ls", "-la"], {
			timeoutMs: 5000,
			waitFor: "exit",
		});
	});

	it("creates all expected tools", () => {
		const runtime = createMockRuntime();
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
});
