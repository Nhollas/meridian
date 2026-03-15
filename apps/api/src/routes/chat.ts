import { randomUUID } from "node:crypto";
import { createRuntimeEventFactory } from "@meridian/contracts/runtime-events";
import { z } from "zod";
import type { AgentProgressEvent, AgentToolCall } from "@/lib/agent/contracts";
import {
	type CreateAgentService,
	createAgentService as createDefaultAgentService,
} from "@/lib/agent/service";
import {
	mapAgentProgressEventToRuntimeEvent,
	mapAgentResultToRuntimeEvent,
	mapErrorToRuntimeEvent,
	mapInterruptToRuntimeEvent,
} from "@/lib/runtime-events/agent-mappers";
import type { SandboxRuntime } from "@/lib/sandbox/runtime";
import { getSandboxRuntime } from "@/lib/sandbox/singleton";
import {
	createSessionStreamRegistry,
	type SessionStreamRegistry,
} from "@/lib/session-stream-registry";

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
	getRuntime?: () => SandboxRuntime;
	registry?: SessionStreamRegistry;
};

export function createChatRoute({
	createAgentService = createDefaultAgentService,
	createTurnId = randomUUID,
	getRuntime = getSandboxRuntime,
	registry = createSessionStreamRegistry(),
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

		void (async () => {
			try {
				const response = await agentService.streamConversation({
					message,
					sessionId,
					onEvent,
				});

				if (response.interrupted) {
					const { commandId } = response.interrupted;

					await registry.writeEvent(
						sessionId,
						mapInterruptToRuntimeEvent(eventFactory, commandId),
					);

					const waitResult = await runtime.waitForBackgroundCommand(
						sessionId,
						commandId,
					);

					partialContent = "";
					partialToolCalls = [];

					const resumeResult = await agentService.resumeConversation({
						sessionId,
						resumeValue: waitResult,
						onEvent,
					});

					await registry.writeEvent(
						sessionId,
						mapAgentResultToRuntimeEvent(eventFactory, resumeResult),
					);
					return;
				}

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
