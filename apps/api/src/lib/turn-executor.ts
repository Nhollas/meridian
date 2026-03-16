import { randomUUID } from "node:crypto";
import { createRuntimeEventFactory } from "@meridian/contracts/runtime-events";
import type { AgentProgressEvent, AgentToolCall } from "@/lib/agent/contracts";
import type { AgentService } from "@/lib/agent/service";
import {
	mapAgentProgressEventToRuntimeEvent,
	mapAgentResultToRuntimeEvent,
	mapErrorToRuntimeEvent,
} from "@/lib/runtime-events/agent-mappers";
import type { SessionStreamRegistry } from "@/lib/session-stream-registry";

type ExecuteTurnParams = {
	agentService: AgentService;
	message: string;
	registry: SessionStreamRegistry;
	sessionId: string;
	turnId: string;
};

export function executeTurn({
	agentService,
	message,
	registry,
	sessionId,
	turnId,
}: ExecuteTurnParams): void {
	const eventFactory = createRuntimeEventFactory({ sessionId, turnId });
	let partialContent = "";
	let partialToolCalls: AgentToolCall[] = [];

	const onEvent = async (event: AgentProgressEvent) => {
		if (event.type === "text-delta") {
			partialContent += event.text;
		}

		if (event.type === "tool-call") {
			partialToolCalls = upsertToolCall(partialToolCalls, event.toolCall);
		}

		await registry.writeEvent(
			sessionId,
			mapAgentProgressEventToRuntimeEvent(eventFactory, event),
		);
	};

	(async () => {
		try {
			const response = await agentService.streamConversation({
				message,
				sessionId,
				onEvent,
			});

			await registry.writeEvent(
				sessionId,
				mapAgentResultToRuntimeEvent(eventFactory, response),
			);
		} catch (error) {
			if (partialContent.trim().length > 0) {
				const response = {
					content: partialContent,
					toolCalls: partialToolCalls,
				};
				await registry.writeEvent(
					sessionId,
					mapAgentResultToRuntimeEvent(eventFactory, response),
				);
				return;
			}

			await registry.writeEvent(
				sessionId,
				mapErrorToRuntimeEvent(eventFactory, error),
			);
		}
	})().catch(console.error);
}

type TriggerSystemTurnParams = {
	agentService: AgentService;
	createTurnId?: () => string;
	message: string;
	registry: SessionStreamRegistry;
	sessionId: string;
};

export function triggerSystemTurn({
	agentService,
	createTurnId = randomUUID,
	message,
	registry,
	sessionId,
}: TriggerSystemTurnParams): string {
	const turnId = createTurnId();

	executeTurn({ agentService, message, registry, sessionId, turnId });

	return turnId;
}

function upsertToolCall(
	toolCalls: AgentToolCall[],
	nextToolCall: AgentToolCall,
) {
	const existingIndex = toolCalls.findIndex(
		(toolCall) => toolCall.id === nextToolCall.id,
	);

	if (existingIndex === -1) {
		return [...toolCalls, nextToolCall];
	}

	return toolCalls.map((toolCall, index) =>
		index === existingIndex ? { ...toolCall, ...nextToolCall } : toolCall,
	);
}
