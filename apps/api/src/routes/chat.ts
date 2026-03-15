import { randomUUID } from "node:crypto";
import { createRuntimeEventFactory } from "@meridian/contracts/runtime-events";
import { z } from "zod";
import type { AgentToolCall } from "@/lib/agent/contracts";
import {
	type AgentService,
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
	turnId: z.string().min(1).optional(),
});

type ChatRouteDependencies = {
	createAgentService?: CreateAgentService;
	createTurnId?: () => string;
	eventBus?: SessionEventBus;
	getRuntime?: () => SandboxRuntime;
};

const REENGAGEMENT_RECURSION_LIMIT = 5;

async function executeTurn({
	agentService,
	eventBus,
	message,
	recursionLimit,
	sessionId,
	turnId,
}: {
	agentService: AgentService;
	eventBus: SessionEventBus;
	message: string;
	recursionLimit?: number | undefined;
	sessionId: string;
	turnId: string;
}) {
	const eventFactory = createRuntimeEventFactory({ sessionId, turnId });
	let partialContent = "";
	let partialToolCalls: AgentToolCall[] = [];

	try {
		const response = await agentService.streamConversation({
			message,
			recursionLimit,
			sessionId,
			onEvent: async (event) => {
				if (event.type === "text-delta") {
					partialContent += event.text;
				}

				if (event.type === "tool-call") {
					partialToolCalls = upsertToolCall(partialToolCalls, event.toolCall);
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

		eventBus.publish(sessionId, mapErrorToRuntimeEvent(eventFactory, error));
	}
}

export function createChatRoute({
	createAgentService = createDefaultAgentService,
	createTurnId = randomUUID,
	eventBus = createSessionEventBus(),
	getRuntime = getSandboxRuntime,
}: ChatRouteDependencies = {}) {
	const sessionTurnQueues = new Map<string, Promise<void>>();

	function enqueueTurn(sessionId: string, run: () => Promise<void>) {
		const previous = sessionTurnQueues.get(sessionId) ?? Promise.resolve();
		const next = previous.then(run, run);
		sessionTurnQueues.set(sessionId, next);
		void next.then(() => {
			if (sessionTurnQueues.get(sessionId) === next) {
				sessionTurnQueues.delete(sessionId);
			}
		});
	}

	function createAgentServiceForSession() {
		const runtime = getRuntime();
		return createAgentService({
			runtime,
			onBackgroundCommandComplete: (completedSessionId, result) => {
				const bgEventFactory = createRuntimeEventFactory({
					sessionId: completedSessionId,
					turnId: result.backgroundCommandId,
				});

				const bgEvent =
					result.exitCode === 0
						? bgEventFactory.create("background.completed", {
								backgroundCommandId: result.backgroundCommandId,
								command: result.command,
								exitCode: result.exitCode,
								stdout: result.stdout,
							})
						: bgEventFactory.create("background.failed", {
								backgroundCommandId: result.backgroundCommandId,
								command: result.command,
								exitCode: result.exitCode,
								stderr: result.stderr,
							});

				eventBus.publish(completedSessionId, bgEvent);

				console.log(
					"[re-engagement] Background command completed for session",
					completedSessionId,
					"- scheduling re-engagement turn",
				);

				// Defer re-engagement into a clean event loop iteration.
				// The onComplete callback fires inside a .then() on the child
				// process completion promise. Running the LLM stream in the same
				// microtask chain causes "Controller is already closed" errors
				// inside LangGraph's streaming internals.
				setTimeout(() => {
					console.log(
						"[re-engagement] Executing re-engagement for session",
						completedSessionId,
					);
					const syntheticMessage = `Background command ${result.backgroundCommandId} (\`${result.command.join(" ")}\`) ${result.status}. Exit code: ${result.exitCode}. Output: ${result.stdout || result.stderr}`;
					const reengagementService = createAgentServiceForSession();
					enqueueTurn(completedSessionId, () =>
						executeTurn({
							agentService: reengagementService,
							eventBus,
							message: syntheticMessage,
							recursionLimit: REENGAGEMENT_RECURSION_LIMIT,
							sessionId: completedSessionId,
							turnId: createTurnId(),
						}),
					);
				}, 0);
			},
		});
	}

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
		const { message, turnId: clientTurnId } = bodyResult.data;
		const turnId = clientTurnId ?? createTurnId();
		const agentService = createAgentServiceForSession();

		enqueueTurn(sessionId, () =>
			executeTurn({
				agentService,
				eventBus,
				message,
				sessionId,
				turnId,
			}),
		);

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
