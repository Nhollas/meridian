import { describe, expect, it } from "vitest";
import type { AgentProgressEvent } from "@/lib/agent/contracts";
import { createAgentService } from "@/lib/agent/service";
import { createInMemorySandboxRuntime } from "../../../tests/support/in-memory-runtime";
import {
	assistantText,
	createScriptedAgentRunner,
} from "../../../tests/support/scripted-agent-runner";

describe("agent service", () => {
	it("passes the session id to the runner so stateful conversations can continue", async () => {
		const turnsBySession = new Map<string, string[]>();
		const runtime = createInMemorySandboxRuntime();
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
		const runtime = createInMemorySandboxRuntime();
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
		const runtime = createInMemorySandboxRuntime();
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

	it("excludes reasoning blocks from streamed assistant text", async () => {
		const runtime = createInMemorySandboxRuntime();
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
