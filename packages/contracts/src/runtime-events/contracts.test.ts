import { describe, expect, it } from "vitest";
import {
	parseRuntimeEventEnvelope,
	type RuntimeEventEnvelope,
	serializeRuntimeEventEnvelope,
} from "./contracts";

type RuntimeEventFixture = {
	[TType in RuntimeEventEnvelope["type"]]: {
		type: TType;
		payload: Extract<RuntimeEventEnvelope, { type: TType }>["payload"];
	};
}[RuntimeEventEnvelope["type"]];

const baseEvent = {
	id: "evt-1",
	sequence: 1,
	sessionId: "session-123",
	turnId: "turn-123",
	timestamp: "2026-03-10T12:00:00.000Z",
} as const;

describe("runtime event contracts", () => {
	it.each([
		{
			type: "assistant.delta",
			payload: {
				delta: "Working through the options...",
			},
		},
		{
			type: "tool.started",
			payload: {
				toolCall: {
					id: "tool-1",
					input: '{"path":"offers.json"}',
					name: "read_file",
				},
			},
		},
		{
			type: "tool.completed",
			payload: {
				toolCall: {
					id: "tool-1",
					input: '{"path":"offers.json"}',
					name: "read_file",
					output: '{"offers":2}',
				},
			},
		},
		{
			type: "tool.failed",
			payload: {
				toolCall: {
					id: "tool-1",
					input: '{"path":"offers.json"}',
					name: "read_file",
					output: '{"error":"ENOENT"}',
				},
			},
		},
		{
			type: "turn.completed",
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
		},
		{
			type: "turn.failed",
			payload: {
				error: "agent exploded",
			},
		},
	] satisfies RuntimeEventFixture[])("serializes and parses %s events", (event) => {
		const serialized = serializeRuntimeEventEnvelope({
			...baseEvent,
			...event,
		});

		expect(parseRuntimeEventEnvelope(JSON.parse(serialized))).toEqual({
			...baseEvent,
			...event,
		});
	});

	it("rejects invalid runtime events", () => {
		expect(() =>
			parseRuntimeEventEnvelope({
				...baseEvent,
				type: "tool.completed",
				payload: {
					toolCall: {
						id: "tool-1",
						name: "read_file",
					},
				},
			}),
		).toThrow(/runtime event/i);
	});
});
