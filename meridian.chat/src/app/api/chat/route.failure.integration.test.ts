import { describe, expect, it } from "vitest";
import {
	createChatRequest,
	readRuntimeEvents,
} from "../../../../tests/support/chat-route";
import { createInMemorySandboxRuntime } from "../../../../tests/support/in-memory-runtime";
import {
	assistantText,
	createScriptedAgentRunner,
} from "../../../../tests/support/scripted-agent-runner";
import { createTestPost } from "./route.integration-support";

describe("POST /api/chat integration - failure handling", () => {
	it("emits turn.failed when the agent crashes before streaming any useful progress", async () => {
		const runtime = createInMemorySandboxRuntime();
		// biome-ignore lint/correctness/useYield: agent crashes before yielding — that's the test scenario
		const createRunner = createScriptedAgentRunner(async function* () {
			throw new Error("agent exploded");
		});
		const POST = createTestPost({ createRunner, runtime });

		const events = await readRuntimeEvents(
			await POST(
				createChatRequest({
					message: "Find me an offer",
					sessionId: "session-123",
				}),
			),
		);

		expect(events).toEqual([
			expect.objectContaining({
				sequence: 1,
				sessionId: "session-123",
				turnId: "turn-1",
				type: "turn.failed",
				payload: {
					error: "agent exploded",
				},
			}),
		]);
	});

	it("promotes partial streamed progress into turn.completed when the agent fails mid-turn", async () => {
		const runtime = createInMemorySandboxRuntime();
		const createRunner = createScriptedAgentRunner(async function* () {
			yield assistantText(
				"Authentication started. Open the login URL in your browser.",
			);
			throw new Error("device flow requires user interaction");
		});
		const POST = createTestPost({ createRunner, runtime });

		const events = await readRuntimeEvents(
			await POST(
				createChatRequest({
					message: "Start login",
					sessionId: "session-123",
				}),
			),
		);

		expect(events).toEqual([
			expect.objectContaining({
				sequence: 1,
				sessionId: "session-123",
				turnId: "turn-1",
				type: "assistant.delta",
				payload: {
					delta: "Authentication started. Open the login URL in your browser.",
				},
			}),
			expect.objectContaining({
				sequence: 2,
				sessionId: "session-123",
				turnId: "turn-1",
				type: "turn.completed",
				payload: {
					content:
						"Authentication started. Open the login URL in your browser.",
					toolCalls: [],
				},
			}),
		]);
	});
});
