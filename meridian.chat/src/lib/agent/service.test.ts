import { describe, expect, it } from "vitest";
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
});
