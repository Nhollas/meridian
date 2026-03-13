import { tool } from "langchain";
import { z } from "zod";
import type { SandboxRuntime } from "@/lib/sandbox/runtime";

type ToolContext = {
	runtime: SandboxRuntime;
	sessionId: string;
};

const emptySchema = z.object({});

export function createRuntimeAgentTools({ runtime, sessionId }: ToolContext) {
	return [
		tool(async () => runtime.getInstructions(sessionId), {
			name: "get_runtime_instructions",
			description:
				"Get the runtime-provided instructions and guidance for this session. Call this first before exploring capabilities.",
			schema: emptySchema,
		}),
		tool(
			async (input: {
				command: string[];
				timeoutMs?: number;
				waitFor?: "exit" | "first-stdout-line";
				keepAlive?: boolean;
				stdin?: string;
			}) => {
				const { command, ...options } = input;
				return JSON.stringify(
					await runtime.runCommand(sessionId, command, options),
				);
			},
			{
				name: "run_command",
				description:
					"Run a command inside the sandbox runtime. Use this to explore installed capabilities and perform tasks. When called with waitFor=first-stdout-line and keepAlive=true, the result may include a backgroundCommandId that can be inspected later.",
				schema: z.object({
					command: z
						.array(z.string())
						.min(1)
						.describe(
							"Executable followed by its arguments, for example ['meridian', '--help']",
						),
					timeoutMs: z
						.number()
						.int()
						.positive()
						.max(300000)
						.optional()
						.describe("Optional timeout in milliseconds"),
					waitFor: z
						.enum(["exit", "first-stdout-line"])
						.optional()
						.describe(
							"Whether to wait for full completion or only the first stdout line",
						),
					keepAlive: z
						.boolean()
						.optional()
						.describe(
							"If true with waitFor=first-stdout-line, leave the process running in the background",
						),
					stdin: z.string().optional().describe("Optional stdin input"),
				}),
			},
		),
		tool(
			async () =>
				JSON.stringify(await runtime.listBackgroundCommands(sessionId)),
			{
				name: "list_background_commands",
				description:
					"List tracked background commands for this session, including their IDs and statuses.",
				schema: emptySchema,
			},
		),
		tool(
			async (input: { commandId: string }) =>
				JSON.stringify(
					await runtime.getBackgroundCommand(sessionId, input.commandId),
				),
			{
				name: "inspect_background_command",
				description:
					"Inspect a background command by ID, including buffered stdout, stderr, and current status.",
				schema: z.object({
					commandId: z.string().min(1).describe("Background command ID"),
				}),
			},
		),
		tool(
			async (input: { commandId: string; timeoutMs?: number }) =>
				JSON.stringify(
					await runtime.waitForBackgroundCommand(
						sessionId,
						input.commandId,
						input.timeoutMs,
					),
				),
			{
				name: "wait_for_background_command",
				description:
					"Wait for a background command to finish or until the optional timeout elapses.",
				schema: z.object({
					commandId: z.string().min(1).describe("Background command ID"),
					timeoutMs: z
						.number()
						.int()
						.positive()
						.max(300000)
						.optional()
						.describe("Optional maximum wait in milliseconds"),
				}),
			},
		),
		tool(
			async (input: { commandId: string }) =>
				JSON.stringify(
					await runtime.terminateBackgroundCommand(sessionId, input.commandId),
				),
			{
				name: "terminate_background_command",
				description:
					"Terminate a running background command and return its final buffered output.",
				schema: z.object({
					commandId: z.string().min(1).describe("Background command ID"),
				}),
			},
		),
		tool(
			async (input: { path?: string }) =>
				JSON.stringify(await runtime.listSessionFiles(sessionId, input.path)),
			{
				name: "list_directory",
				description: "List files and directories inside the session workspace.",
				schema: z.object({
					path: z
						.string()
						.optional()
						.describe("Optional relative directory path. Defaults to '.'"),
				}),
			},
		),
		tool(
			async (input: { path: string }) =>
				runtime.readSessionFile(sessionId, input.path),
			{
				name: "read_file",
				description: "Read a file from the session workspace.",
				schema: z.object({
					path: z.string().describe("Relative path to the file"),
				}),
			},
		),
		tool(
			async (input: { path: string; contents: string }) =>
				JSON.stringify({
					path: await runtime.writeSessionFile(
						sessionId,
						input.path,
						input.contents,
					),
				}),
			{
				name: "write_file",
				description:
					"Write a file into the session workspace. Useful for JSON payloads or other command inputs.",
				schema: z.object({
					path: z.string().describe("Relative path to write"),
					contents: z.string().describe("File contents"),
				}),
			},
		),
	];
}

export function extractTextContent(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}

	if (!Array.isArray(content)) {
		return "";
	}

	return content
		.map((item) => {
			if (typeof item === "string") {
				return item;
			}

			if (typeof item !== "object" || item === null || !("type" in item)) {
				return "";
			}

			if (
				item.type === "text" &&
				"text" in item &&
				typeof item.text === "string"
			) {
				return item.text;
			}

			return "";
		})
		.join("");
}

/**
 * Normalizes LangChain's polymorphic message content into a plain string.
 * LangChain can represent content as a string, an array of content blocks,
 * or a nested object with a `.content` property. This function tries
 * extractTextContent first, then unwraps nested `.content`, and falls back
 * to JSON.stringify as a last resort.
 */
export function stringifyMessageContent(content: unknown): string {
	const text = extractTextContent(content);
	if (text) {
		return text;
	}

	if (
		typeof content === "object" &&
		content !== null &&
		"content" in content &&
		content.content !== content
	) {
		return stringifyMessageContent(content.content);
	}

	return typeof content === "undefined" ? "" : JSON.stringify(content);
}
