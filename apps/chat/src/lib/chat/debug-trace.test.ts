import type { RuntimeEventEnvelope } from "@meridian/contracts/runtime-events";
import { describe, expect, it } from "vitest";
import { buildDebugTrace, createTurnTrace } from "@/lib/chat/debug-trace";
import type { ChatMessageViewModel } from "@/lib/chat/view-models";

const runtimeEvents: RuntimeEventEnvelope[] = [
	{
		id: "evt-1",
		payload: {
			delta: "Working through the options...",
		},
		sequence: 1,
		sessionId: "session-123",
		timestamp: "2026-03-10T12:00:00.000Z",
		turnId: "turn-123",
		type: "assistant.delta",
	},
	{
		id: "evt-2",
		payload: {
			toolCall: {
				id: "tool-1",
				input: '{"path":"offers.json"}',
				name: "read_file",
				output: '{"offers":2}',
			},
		},
		sequence: 2,
		sessionId: "session-123",
		timestamp: "2026-03-10T12:00:01.000Z",
		turnId: "turn-123",
		type: "tool.completed",
	},
	{
		id: "evt-3",
		payload: {
			content: "I found 2 offers worth comparing.",
			toolCalls: [
				{
					id: "tool-1",
					input: '{"path":"offers.json"}',
					name: "read_file",
					output: '{"offers":2}',
					state: "completed",
				},
			],
		},
		sequence: 3,
		sessionId: "session-123",
		timestamp: "2026-03-10T12:00:02.000Z",
		turnId: "turn-123",
		type: "turn.completed",
	},
];

describe("chat debug trace", () => {
	it("captures runtime events in order for each turn", () => {
		const turnTrace = createTurnTrace({
			recordedAt: "2026-03-10T12:00:03.000Z",
			response: {
				content: "I found 2 offers worth comparing.",
				toolCalls: [],
			},
			runtimeEvents,
			sessionId: "session-123",
			userMessageId: "msg-user-1",
		});

		expect(turnTrace.runtimeEvents.map((event) => event.sequence)).toEqual([
			1, 2, 3,
		]);
		expect(
			buildDebugTrace({
				messages: [
					{
						content: "Find me a deal",
						id: "msg-user-1",
						role: "user",
						timestamp: "2026-03-10T12:00:00.000Z",
					},
				] satisfies ChatMessageViewModel[],
				sessionId: "session-123",
				turnLogs: [turnTrace],
			}).turnLogs[0]?.runtimeEvents,
		).toEqual(runtimeEvents);
	});
});
