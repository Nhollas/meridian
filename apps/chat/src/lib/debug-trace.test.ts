import type { RuntimeEventEnvelope } from "@meridian/contracts/runtime-events";
import { describe, expect, it } from "vitest";
import {
	buildCopyDebugTrace,
	buildDebugTrace,
	createTurnTrace,
} from "@/lib/debug-trace";
import type { ChatMessageViewModel } from "@/lib/view-models";

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

	it("builds a compact copy trace with messages and tool calls only", () => {
		const copyTrace = buildCopyDebugTrace({
			messages: [
				{
					content: "Find me a deal",
					id: "msg-user-1",
					role: "user",
					timestamp: "2026-03-10T12:00:00.000Z",
				},
				{
					content: "I found 2 offers worth comparing.",
					id: "msg-assistant-1",
					role: "assistant",
					timestamp: "2026-03-10T12:00:02.000Z",
					toolCalls: [
						{
							id: "tool-1",
							input: '{"path":"offers.json"}',
							name: "read_file",
							result: '{"offers":2}',
							status: "completed",
						},
					],
				},
			] satisfies ChatMessageViewModel[],
			sessionId: "session-123",
		});

		expect(copyTrace).toMatchObject({
			sessionId: "session-123",
			messages: [
				{
					content: "Find me a deal",
					id: "msg-user-1",
					role: "user",
				},
				{
					content: "I found 2 offers worth comparing.",
					id: "msg-assistant-1",
					role: "assistant",
					toolCalls: [
						{
							id: "tool-1",
							input: '{"path":"offers.json"}',
							name: "read_file",
							result: '{"offers":2}',
							status: "completed",
						},
					],
				},
			],
		});
		expect(copyTrace).not.toHaveProperty("turnLogs");
	});
});
