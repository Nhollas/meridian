import { z } from "zod";

const timestampSchema = z.string().datetime({ offset: true });

const toolCallReferenceSchema = z.object({
	id: z.string().min(1),
	input: z.string().optional(),
	name: z.string().min(1),
});

const toolCallResultSchema = toolCallReferenceSchema.extend({
	output: z.string(),
});

const agentToolCallSchema = toolCallResultSchema.extend({
	state: z.enum(["running", "completed", "failed"]).optional(),
});

const runtimeEventEnvelopeSchema = z.discriminatedUnion("type", [
	z.object({
		id: z.string().min(1),
		payload: z.object({
			delta: z.string(),
		}),
		sequence: z.number().int().positive(),
		sessionId: z.string().min(1),
		timestamp: timestampSchema,
		turnId: z.string().min(1),
		type: z.literal("assistant.delta"),
	}),
	z.object({
		id: z.string().min(1),
		payload: z.object({
			toolCall: toolCallReferenceSchema,
		}),
		sequence: z.number().int().positive(),
		sessionId: z.string().min(1),
		timestamp: timestampSchema,
		turnId: z.string().min(1),
		type: z.literal("tool.started"),
	}),
	z.object({
		id: z.string().min(1),
		payload: z.object({
			toolCall: toolCallResultSchema,
		}),
		sequence: z.number().int().positive(),
		sessionId: z.string().min(1),
		timestamp: timestampSchema,
		turnId: z.string().min(1),
		type: z.literal("tool.completed"),
	}),
	z.object({
		id: z.string().min(1),
		payload: z.object({
			toolCall: toolCallResultSchema,
		}),
		sequence: z.number().int().positive(),
		sessionId: z.string().min(1),
		timestamp: timestampSchema,
		turnId: z.string().min(1),
		type: z.literal("tool.failed"),
	}),
	z.object({
		id: z.string().min(1),
		payload: z.object({
			content: z.string(),
			toolCalls: z.array(agentToolCallSchema),
		}),
		sequence: z.number().int().positive(),
		sessionId: z.string().min(1),
		timestamp: timestampSchema,
		turnId: z.string().min(1),
		type: z.literal("turn.completed"),
	}),
	z.object({
		id: z.string().min(1),
		payload: z.object({
			error: z.string().min(1),
		}),
		sequence: z.number().int().positive(),
		sessionId: z.string().min(1),
		timestamp: timestampSchema,
		turnId: z.string().min(1),
		type: z.literal("turn.failed"),
	}),
]);

export type RuntimeEventEnvelope = z.infer<typeof runtimeEventEnvelopeSchema>;
export type RuntimeEventType = RuntimeEventEnvelope["type"];
export type RuntimeEventPayload<TType extends RuntimeEventType> = Extract<
	RuntimeEventEnvelope,
	{ type: TType }
>["payload"];

export function parseRuntimeEventEnvelope(
	value: unknown,
): RuntimeEventEnvelope {
	const parsed = runtimeEventEnvelopeSchema.safeParse(value);
	if (!parsed.success) {
		throw new Error(`Invalid runtime event: ${parsed.error.message}`);
	}

	return parsed.data;
}

export function serializeRuntimeEventEnvelope(
	event: RuntimeEventEnvelope,
): string {
	return JSON.stringify(event);
}

export function createRuntimeEventFactory({
	createId = () => globalThis.crypto.randomUUID(),
	now = () => new Date().toISOString(),
	sessionId,
	turnId,
}: {
	createId?: () => string;
	now?: () => string;
	sessionId: string;
	turnId: string;
}) {
	let sequence = 0;

	return {
		create<TType extends RuntimeEventType>(
			type: TType,
			payload: RuntimeEventPayload<TType>,
		): Extract<RuntimeEventEnvelope, { type: TType }> {
			sequence += 1;

			return parseRuntimeEventEnvelope({
				id: createId(),
				payload,
				sequence,
				sessionId,
				timestamp: now(),
				turnId,
				type,
			}) as Extract<RuntimeEventEnvelope, { type: TType }>;
		},
	};
}

export type RuntimeToolCallResult = z.infer<typeof toolCallResultSchema>;
