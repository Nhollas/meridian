import type { RuntimeEventEnvelope } from "@/lib/runtime-events/contracts";
import type { ToolCallViewModel, ToolCallViewStatus } from "./contracts";

type RuntimeToolEvent = Extract<
	RuntimeEventEnvelope,
	{ type: "tool.started" | "tool.completed" | "tool.failed" }
>;

type RuntimeCompletedTurnEvent = Extract<
	RuntimeEventEnvelope,
	{ type: "turn.completed" }
>;

export function mapRuntimeToolEventToViewModel(
	event: RuntimeToolEvent,
): ToolCallViewModel {
	if (event.type === "tool.started") {
		return {
			id: event.payload.toolCall.id,
			...(event.payload.toolCall.input
				? { input: event.payload.toolCall.input }
				: {}),
			name: event.payload.toolCall.name,
			result: "",
			status: "running",
		};
	}

	return {
		id: event.payload.toolCall.id,
		...(event.payload.toolCall.input
			? { input: event.payload.toolCall.input }
			: {}),
		name: event.payload.toolCall.name,
		result: event.payload.toolCall.output,
		status: event.type === "tool.failed" ? "error" : "completed",
	};
}

export function mapRuntimeTurnToolCallsToViewModels(
	toolCalls: RuntimeCompletedTurnEvent["payload"]["toolCalls"],
): ToolCallViewModel[] {
	return toolCalls.map((toolCall) => ({
		id: toolCall.id,
		...(toolCall.input ? { input: toolCall.input } : {}),
		name: toolCall.name,
		result: toolCall.output,
		...(toolCall.state ? { status: mapToolState(toolCall.state) } : {}),
	}));
}

function mapToolState(
	state: "running" | "completed" | "failed",
): ToolCallViewStatus {
	return state === "failed" ? "error" : state;
}
