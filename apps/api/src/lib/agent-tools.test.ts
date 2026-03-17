import { afterEach, describe, expect, it, vi } from "vitest";
import { createDockerRuntime } from "@/lib/sandbox/docker-runtime";
import { createFakeDockerClient } from "../../tests/support/fake-docker-client";
import { createTempSessionDir } from "../../tests/support/temp-session-dir";
import { createTestConfig } from "../../tests/support/test-config";

// biome-ignore lint/complexity/noBannedTypes: test helper for mocked langchain tools
type AnyFn = Function;

vi.mock("langchain", () => ({
	tool: (fn: AnyFn, opts: Record<string, unknown>) => {
		Object.defineProperty(fn, "name", { value: opts["name"], writable: true });
		return fn;
	},
}));

import { createRuntimeAgentTools, extractTextContent } from "@/lib/agent-tools";

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
		await using tmp = await createTempSessionDir();
		await tmp.writeSessionFile("sess-1", "test.txt", "file content");

		const client = createFakeDockerClient();
		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{
				client,
			},
		);
		const tools = createRuntimeAgentTools({ runtime, sessionId: "sess-1" });

		const result = await invokeTool(findTool(tools, "read_file"), {
			path: "test.txt",
		});

		expect(result).toBe("file content");
	});

	it("propagates runtime errors", async () => {
		await using tmp = await createTempSessionDir();
		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{
				client: createFakeDockerClient(),
			},
		);
		const tools = createRuntimeAgentTools({ runtime, sessionId: "sess-1" });

		await expect(
			invokeTool(findTool(tools, "read_file"), { path: "missing.txt" }),
		).rejects.toThrow("missing.txt");
	});

	it("creates all expected tools", async () => {
		await using tmp = await createTempSessionDir();
		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{
				client: createFakeDockerClient(),
			},
		);
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

	it("passes command options through to the runtime", async () => {
		await using tmp = await createTempSessionDir();
		const client = createFakeDockerClient({
			execFixtures: [
				{
					command: ["ls", "-la"],
					result: { exitCode: 0, stderr: "", stdout: "total 0\n" },
				},
			],
		});
		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{
				client,
			},
		);
		const tools = createRuntimeAgentTools({ runtime, sessionId: "sess-1" });

		const result = await invokeTool(findTool(tools, "run_command"), {
			command: ["ls", "-la"],
			timeoutMs: 5000,
			waitFor: "exit",
		});

		expect(result).toContain('"exitCode":0');
		expect(client.calls.filter((c) => c.method === "exec")).toEqual([
			{
				args: [
					"meridian-chat-sandbox-sess-1",
					["ls", "-la"],
					{ timeoutMs: 5000, waitFor: "exit" },
				],
				method: "exec",
			},
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
