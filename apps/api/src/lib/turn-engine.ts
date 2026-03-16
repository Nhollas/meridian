import { randomUUID } from "node:crypto";
import { upsertById } from "@meridian/contracts/collections";
import { createRuntimeEventFactory } from "@meridian/contracts/runtime-events";
import type { AgentProgressEvent, AgentToolCall } from "@/lib/agent/contracts";
import type { AgentService } from "@/lib/agent/service";
import {
	type CreateAgentService,
	createAgentService as createDefaultAgentService,
} from "@/lib/agent/service";
import type { BackgroundCommandCompleteCallback } from "@/lib/agent/tools";
import {
	mapAgentProgressEventToRuntimeEvent,
	mapAgentResultToRuntimeEvent,
	mapErrorToRuntimeEvent,
} from "@/lib/runtime-events/agent-mappers";
import type { SandboxRuntime } from "@/lib/sandbox/runtime";
import { getSandboxRuntime } from "@/lib/sandbox/singleton";
import {
	createSessionStreamRegistry,
	type SessionStreamRegistry,
} from "@/lib/session-stream-registry";

export interface TurnEngine {
	submit(params: {
		sessionId: string;
		message: string;
		turnId?: string;
	}): string;
	readonly registry: SessionStreamRegistry;
}

export type TurnEngineDependencies = {
	createAgentService?: CreateAgentService;
	createTurnId?: () => string;
	getRuntime?: () => SandboxRuntime;
	registry?: SessionStreamRegistry;
};

export function createTurnEngine({
	createAgentService = createDefaultAgentService,
	createTurnId = randomUUID,
	getRuntime = getSandboxRuntime,
	registry = createSessionStreamRegistry(),
}: TurnEngineDependencies = {}): TurnEngine {
	const sessionTurnQueue: Map<string, Promise<void>> = new Map();

	const onBackgroundCommandComplete: BackgroundCommandCompleteCallback = ({
		commandId,
		command,
		result,
		sessionId,
	}) => {
		const message = [
			`[System] Background command ${commandId} (${command.join(" ")}) ${result.status}.`,
			result.stdout ? `Output:\n${result.stdout}` : "",
			result.stderr ? `Errors:\n${result.stderr}` : "",
			"Briefly acknowledge what changed and continue with the next step. Do not repeat information from previous turns.",
		]
			.filter(Boolean)
			.join("\n");

		engine.submit({ sessionId, message });
	};

	function createAgentServiceForTurn(): AgentService {
		return createAgentService({
			onBackgroundCommandComplete,
			runtime: getRuntime(),
		});
	}

	function submit({
		sessionId,
		message,
		turnId,
	}: {
		sessionId: string;
		message: string;
		turnId?: string;
	}): string {
		const resolvedTurnId = turnId ?? createTurnId();
		const agentService = createAgentServiceForTurn();

		const previous = sessionTurnQueue.get(sessionId) ?? Promise.resolve();

		const current = previous.then(() =>
			runTurn({
				agentService,
				message,
				registry,
				sessionId,
				turnId: resolvedTurnId,
			}),
		);

		sessionTurnQueue.set(sessionId, current);

		current.then(() => {
			if (sessionTurnQueue.get(sessionId) === current) {
				sessionTurnQueue.delete(sessionId);
			}
		});

		return resolvedTurnId;
	}

	const engine: TurnEngine = { submit, registry };
	return engine;
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
			partialToolCalls = upsertById(partialToolCalls, event.toolCall);
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
