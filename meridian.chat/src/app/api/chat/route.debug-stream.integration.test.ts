import { describe, expect, it, vi } from "vitest";
import {
	createChatRequest,
	readRuntimeEvents,
} from "../../../../tests/support/chat-route";
import { createInMemorySandboxRuntime } from "../../../../tests/support/in-memory-runtime";
import {
	assistantText,
	createScriptedAgentRunner,
	invokeTool,
	toolCompleted,
	toolStarted,
} from "../../../../tests/support/scripted-agent-runner";
import { createTestPost } from "./route.integration-support";

describe("POST /api/chat integration - debug stream delay", () => {
	it("preserves event ordering and payloads when debug delay is enabled", async () => {
		const runtime = createInMemorySandboxRuntime({
			files: {
				"offers.json": '{"offers":2}',
			},
		});
		const createRunner = createScriptedAgentRunner(async function* ({ tools }) {
			yield toolStarted({
				id: "tool-1",
				input: { path: "offers.json" },
				name: "read_file",
			});
			const output = await invokeTool(tools, "read_file", {
				path: "offers.json",
			});
			yield toolCompleted({
				id: "tool-1",
				name: "read_file",
				output,
			});
			yield assistantText("I found 2 offers worth comparing.");
		});
		const delayedSleep = vi.fn(async () => {});
		const withoutDelay = createTestPost({ createRunner, runtime });
		const withDelay = createTestPost({
			createRunner,
			runtime,
			sleep: delayedSleep,
		});

		const normalEvents = await readRuntimeEvents(
			await withoutDelay(
				createChatRequest({
					message: "Find me an offer",
					sessionId: "session-debug",
				}),
			),
		);
		const delayedEvents = await readRuntimeEvents(
			await withDelay(
				createChatRequest(
					{
						message: "Find me an offer",
						sessionId: "session-debug",
					},
					{
						headers: {
							"x-meridian-debug-stream-delay-ms": "50",
						},
					},
				),
			),
		);

		expect(normalizeRuntimeEvents(normalEvents)).toEqual(
			normalizeRuntimeEvents(delayedEvents),
		);
		expect(delayedSleep).toHaveBeenCalledTimes(delayedEvents.length);
		expect(delayedSleep).toHaveBeenNthCalledWith(1, 50);
		expect(delayedSleep).toHaveBeenNthCalledWith(2, 50);
		expect(delayedSleep).toHaveBeenNthCalledWith(3, 50);
	});
});

function normalizeRuntimeEvents(
	events: Awaited<ReturnType<typeof readRuntimeEvents>>,
) {
	return events.map((event) => ({
		payload: event.payload,
		sequence: event.sequence,
		sessionId: event.sessionId,
		type: event.type,
	}));
}
