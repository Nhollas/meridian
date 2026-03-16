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

export type SessionTurnQueue = Map<string, Promise<void>>;

const defaultSessionTurnQueue: SessionTurnQueue = new Map();

type ExecuteTurnParams = {
	agentService: AgentService;
	message: string;
	registry: SessionStreamRegistry;
	sessionId: string;
	sessionTurnQueue?: SessionTurnQueue | undefined;
	turnId: string;
};

export function executeTurn({
	agentService,
	message,
	registry,
	sessionId,
	sessionTurnQueue = defaultSessionTurnQueue,
	turnId,
}: ExecuteTurnParams): void {
	const previous = sessionTurnQueue.get(sessionId) ?? Promise.resolve();

	const current = previous.then(() =>
		runTurn({ agentService, message, registry, sessionId, turnId }),
	);

	sessionTurnQueue.set(sessionId, current);

	current.then(() => {
		if (sessionTurnQueue.get(sessionId) === current) {
			sessionTurnQueue.delete(sessionId);
		}
	});
}

type TriggerSystemTurnParams = {
	agentService: AgentService;
	createTurnId?: () => string;
	message: string;
	registry: SessionStreamRegistry;
	sessionId: string;
	sessionTurnQueue?: SessionTurnQueue | undefined;
};

export function triggerSystemTurn({
	agentService,
	createTurnId = randomUUID,
	message,
	registry,
	sessionId,
	sessionTurnQueue,
}: TriggerSystemTurnParams): string {
	const turnId = createTurnId();

	executeTurn({
		agentService,
		message,
		registry,
		sessionId,
		sessionTurnQueue,
		turnId,
	});

	return turnId;
}

async function runTurn({
	agentService,
	message,
	registry,
	sessionId,
	turnId,
}: {
	agentService: AgentService;
	message: string;
	registry: SessionStreamRegistry;
	sessionId: string;
	turnId: string;
}): Promise<void> {
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
