import { GraphRecursionError } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";
import type { AgentProgressEvent } from "@/lib/agent";
import { createAgentService } from "@/lib/agent";
import { createDockerRuntime } from "@/lib/sandbox/docker-runtime";
import { createFakeDockerClient } from "../../tests/support/fake-docker-client";
import {
	assistantText,
	createScriptedAgentRunner,
	toolCompleted,
	toolStarted,
} from "../../tests/support/scripted-agent-runner";
import { createTempSessionDir } from "../../tests/support/temp-session-dir";
import { createTestConfig } from "../../tests/support/test-config";

describe("agent service", () => {
	it("passes the session id to the runner so stateful conversations can continue", async () => {
		await using tmp = await createTempSessionDir();
		const turnsBySession = new Map<string, string[]>();
		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{
				client: createFakeDockerClient(),
			},
		);
		const createRunner = createScriptedAgentRunner(async function* ({
			message,
			sessionId,
		}) {
			const nextHistory = [...(turnsBySession.get(sessionId) ?? []), message];
			turnsBySession.set(sessionId, nextHistory);

			yield assistantText(`Messages so far: ${nextHistory.join(" -> ")}`);
		});
		const service = createAgentService({ createRunner, runtime });

		await expect(
			service.streamConversation({
				message: "first",
				sessionId: "session-a",
			}),
		).resolves.toEqual({
			content: "Messages so far: first",
			toolCalls: [],
		});

		await expect(
			service.streamConversation({
				message: "second",
				sessionId: "session-a",
			}),
		).resolves.toEqual({
			content: "Messages so far: first -> second",
			toolCalls: [],
		});

		await expect(
			service.streamConversation({
				message: "other",
				sessionId: "session-b",
			}),
		).resolves.toEqual({
			content: "Messages so far: other",
			toolCalls: [],
		});
	});

	it("does not retain conversation history across fresh service instances", async () => {
		await using tmp = await createTempSessionDir();
		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{
				client: createFakeDockerClient(),
			},
		);
		const createFirstService = () => {
			const turnsBySession = new Map<string, string[]>();
			const createRunner = createScriptedAgentRunner(async function* ({
				message,
				sessionId,
			}) {
				const nextHistory = [...(turnsBySession.get(sessionId) ?? []), message];
				turnsBySession.set(sessionId, nextHistory);

				yield assistantText(`Messages so far: ${nextHistory.join(" -> ")}`);
			});

			return createAgentService({ createRunner, runtime });
		};

		const firstProcessService = createFirstService();
		await expect(
			firstProcessService.streamConversation({
				message: "first",
				sessionId: "session-a",
			}),
		).resolves.toEqual({
			content: "Messages so far: first",
			toolCalls: [],
		});
		await expect(
			firstProcessService.streamConversation({
				message: "second",
				sessionId: "session-a",
			}),
		).resolves.toEqual({
			content: "Messages so far: first -> second",
			toolCalls: [],
		});

		const restartedProcessService = createFirstService();

		await expect(
			restartedProcessService.streamConversation({
				message: "third",
				sessionId: "session-a",
			}),
		).resolves.toEqual({
			content: "Messages so far: third",
			toolCalls: [],
		});
	});

	it("completes gracefully when the stream throws a closed controller error mid-iteration", async () => {
		await using tmp = await createTempSessionDir();
		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{
				client: createFakeDockerClient(),
			},
		);
		const createRunner = createScriptedAgentRunner(async function* () {
			yield assistantText("Partial content before crash");
			throw new TypeError("Invalid state: Controller is already closed");
		});
		const service = createAgentService({ createRunner, runtime });
		const events: AgentProgressEvent[] = [];

		const result = await service.streamConversation({
			message: "hello",
			sessionId: "session-a",
			onEvent: (event) => {
				events.push(event);
			},
		});

		expect(result.content).toBe("Partial content before crash");
		expect(events).toEqual([
			expect.objectContaining({
				type: "text-delta",
				text: "Partial content before crash",
			}),
		]);
	});

	it("returns the recursion limit message and preserves tool calls when the graph exceeds max iterations", async () => {
		await using tmp = await createTempSessionDir();
		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{ client: createFakeDockerClient() },
		);
		const createRunner = createScriptedAgentRunner(async function* () {
			yield toolStarted({
				id: "tool-1",
				input: { command: ["ls"] },
				name: "run_command",
			});
			yield toolCompleted({
				id: "tool-1",
				name: "run_command",
				output: "file.txt",
			});
			throw new GraphRecursionError(
				"Recursion limit of 20 reached without hitting a stop condition",
			);
		});
		const service = createAgentService({ createRunner, runtime });
		const events: AgentProgressEvent[] = [];

		const result = await service.streamConversation({
			message: "do something complex",
			sessionId: "session-a",
			onEvent: (event) => {
				events.push(event);
			},
		});

		expect(result.content).toBe(
			"The agent stopped because it kept chaining tool calls without reaching a final answer. I returned the tool timeline so you can see what it tried. The next fix is to tighten the prompt or the runtime instructions for this task.",
		);
		expect(result.toolCalls).toEqual([
			expect.objectContaining({
				id: "tool-1",
				name: "run_command",
				state: "completed",
			}),
		]);
	});

	it("excludes reasoning blocks from streamed assistant text", async () => {
		await using tmp = await createTempSessionDir();
		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{
				client: createFakeDockerClient(),
			},
		);
		const createRunner = createScriptedAgentRunner(async function* () {
			yield {
				content: [
					{ reasoning: "I checked auth first.", type: "reasoning" },
					{
						text: "Please complete sign-in and send your postcode.",
						type: "text",
					},
				],
				messageType: "ai",
				mode: "messages",
			};
		});
		const service = createAgentService({ createRunner, runtime });

		await expect(
			service.streamConversation({
				message: "Compare broadband for me",
				sessionId: "session-a",
			}),
		).resolves.toEqual({
			content: "Please complete sign-in and send your postcode.",
			toolCalls: [],
		});
	});
});
