import type {
	AgentProgressEvent,
	AgentTurnResult,
} from "@/lib/agent/contracts";
import type {
	createRuntimeEventFactory,
	RuntimeEventPayload,
} from "./contracts";

type RuntimeEventFactory = ReturnType<typeof createRuntimeEventFactory>;

export function mapAgentProgressEventToRuntimeEvent(
	factory: RuntimeEventFactory,
	event: AgentProgressEvent,
) {
	if (event.type === "text-delta") {
		return factory.create("assistant.delta", {
			delta: event.text,
		});
	}

	const toolCall = event.toolCall;
	if (toolCall.state === "running") {
		return factory.create("tool.started", {
			toolCall: {
				id: toolCall.id,
				...(toolCall.input ? { input: toolCall.input } : {}),
				name: toolCall.name,
			},
		});
	}

	return factory.create(
		toolCall.state === "failed" ? "tool.failed" : "tool.completed",
		{
			toolCall: {
				id: toolCall.id,
				...(toolCall.input ? { input: toolCall.input } : {}),
				name: toolCall.name,
				output: toolCall.output,
			},
		} satisfies
			| RuntimeEventPayload<"tool.completed">
			| RuntimeEventPayload<"tool.failed">,
	);
}

export function mapAgentResultToRuntimeEvent(
	factory: RuntimeEventFactory,
	result: AgentTurnResult,
) {
	return factory.create("turn.completed", {
		content: result.content,
		toolCalls: result.toolCalls,
	});
}

export function mapErrorToRuntimeEvent(
	factory: RuntimeEventFactory,
	error: unknown,
) {
	const message = error instanceof Error ? error.message : String(error);

	return factory.create("turn.failed", {
		error: message || "Unknown error",
	});
}
