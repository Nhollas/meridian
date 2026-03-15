import { randomUUID } from "node:crypto";
import { createRuntimeEventFactory } from "@meridian/contracts/runtime-events";
import { z } from "zod";
import type { AgentToolCall } from "@/lib/agent/contracts";
import {
	type CreateAgentService,
	createAgentService as createDefaultAgentService,
} from "@/lib/agent/service";
import {
	mapAgentProgressEventToRuntimeEvent,
	mapAgentResultToRuntimeEvent,
	mapErrorToRuntimeEvent,
} from "@/lib/runtime-events/agent-mappers";
import type { SandboxRuntime } from "@/lib/sandbox/runtime";
import { getSandboxRuntime } from "@/lib/sandbox/singleton";
import type { SessionEventBus } from "@/lib/session-event-bus";
import { createSessionEventBus } from "@/lib/session-event-bus";

const sessionIdSchema = z
	.string()
	.min(1, "Missing or invalid sessionId.")
	.regex(/^[A-Za-z0-9_-]+$/, "Missing or invalid sessionId.");

const chatRequestSchema = z.object({
	message: z
		.string()
		.nonempty("Missing or invalid message.")
		.refine((s) => s.trim().length > 0, "Missing or invalid message."),
});

type ChatRouteDependencies = {
	createAgentService?: CreateAgentService;
	createTurnId?: () => string;
	eventBus?: SessionEventBus;
	getRuntime?: () => SandboxRuntime;
};

export function createChatRoute({
	createAgentService = createDefaultAgentService,
	createTurnId = randomUUID,
	eventBus = createSessionEventBus(),
	getRuntime = getSandboxRuntime,
}: ChatRouteDependencies = {}) {
	return async (request: Request) => {
		const sessionIdResult = sessionIdSchema.safeParse(
			request.headers.get("session-id"),
		);

		if (!sessionIdResult.success) {
			const errors = sessionIdResult.error.issues.map((issue) => issue.message);
			return Response.json({ errors }, { status: 400 });
		}

		const bodyResult = chatRequestSchema.safeParse(await request.json());

		if (!bodyResult.success) {
			const errors = bodyResult.error.issues.map((issue) => issue.message);
			return Response.json({ errors }, { status: 400 });
		}

		const sessionId = sessionIdResult.data;
		const { message } = bodyResult.data;
		const turnId = createTurnId();
		const runtime = getRuntime();
		const agentService = createAgentService({ runtime });

		const eventFactory = createRuntimeEventFactory({
			sessionId,
			turnId,
		});
		let partialContent = "";
		let partialToolCalls: AgentToolCall[] = [];

		void (async () => {
			try {
				const response = await agentService.streamConversation({
					message,
					sessionId,
					onEvent: async (event) => {
						if (event.type === "text-delta") {
							partialContent += event.text;
						}

						if (event.type === "tool-call") {
							partialToolCalls = upsertToolCall(
								partialToolCalls,
								event.toolCall,
							);
						}

						eventBus.publish(
							sessionId,
							mapAgentProgressEventToRuntimeEvent(eventFactory, event),
						);
					},
				});
				eventBus.publish(
					sessionId,
					mapAgentResultToRuntimeEvent(eventFactory, response),
				);
			} catch (error) {
				if (partialContent.trim().length > 0) {
					const response = {
						content: partialContent,
						toolCalls: partialToolCalls,
					};
					eventBus.publish(
						sessionId,
						mapAgentResultToRuntimeEvent(eventFactory, response),
					);
					return;
				}

				eventBus.publish(
					sessionId,
					mapErrorToRuntimeEvent(eventFactory, error),
				);
			}
		})();

		return Response.json({ turnId }, { status: 202 });
	};
}

export const handleChat = createChatRoute();

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
