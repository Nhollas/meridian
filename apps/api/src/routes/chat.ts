import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
	createRuntimeEventFactory,
	type RuntimeEventEnvelope,
	serializeRuntimeEventEnvelope,
} from "@meridian/contracts/runtime-events";
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
import { getSandboxRuntime } from "@/lib/sandbox";
import type { SandboxRuntime } from "@/lib/sandbox/runtime";
import { SESSION_ID_PATTERN } from "@/lib/sandbox/runtime-shared";

const MAX_DEBUG_DELAY_MS = 1000;
const encoder = new TextEncoder();

const chatRequestSchema = z.object({
	sessionId: z
		.string()
		.nonempty("Missing or invalid sessionId.")
		.regex(SESSION_ID_PATTERN, "Missing or invalid sessionId."),
	message: z
		.string()
		.nonempty("Missing or invalid message.")
		.refine((s) => s.trim().length > 0, "Missing or invalid message."),
});

type ChatRouteDependencies = {
	createAgentService?: CreateAgentService;
	createTurnId?: () => string;
	getRuntime?: () => SandboxRuntime;
	sleep?: (milliseconds: number) => Promise<void>;
};

export function createChatRoute({
	createAgentService = createDefaultAgentService,
	createTurnId = randomUUID,
	getRuntime = getSandboxRuntime,
	sleep = delay,
}: ChatRouteDependencies = {}) {
	return async (request: Request) => {
		const result = chatRequestSchema.safeParse(await request.json());

		if (!result.success) {
			const errors = result.error.issues.map((issue) => issue.message);
			return Response.json({ errors }, { status: 400 });
		}

		const { message, sessionId } = result.data;
		const debugDelayMs = getDebugDelayMs(request.headers);
		const runtime = getRuntime();
		const agentService = createAgentService({ runtime });

		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				const eventFactory = createRuntimeEventFactory({
					sessionId,
					turnId: createTurnId(),
				});
				let partialContent = "";
				let partialToolCalls: AgentToolCall[] = [];
				const writeEvent = async (event: RuntimeEventEnvelope) => {
					controller.enqueue(
						encoder.encode(`${serializeRuntimeEventEnvelope(event)}\n`),
					);
					if (debugDelayMs > 0) {
						await sleep(debugDelayMs);
					}
				};

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

								await writeEvent(
									mapAgentProgressEventToRuntimeEvent(eventFactory, event),
								);
							},
						});
						await writeEvent(
							mapAgentResultToRuntimeEvent(eventFactory, response),
						);
					} catch (error) {
						if (partialContent.trim().length > 0) {
							const response = {
								content: partialContent,
								toolCalls: partialToolCalls,
							};
							await writeEvent(
								mapAgentResultToRuntimeEvent(eventFactory, response),
							);
							return;
						}

						await writeEvent(mapErrorToRuntimeEvent(eventFactory, error));
					} finally {
						controller.close();
					}
				})();
			},
		});

		return new Response(stream, {
			headers: {
				"Cache-Control": "no-cache, no-transform",
				Connection: "keep-alive",
				"Content-Type": "application/x-ndjson; charset=utf-8",
			},
		});
	};
}

export const handleChat = createChatRoute();

function getDebugDelayMs(headers: Headers) {
	const raw = headers.get("x-meridian-debug-stream-delay-ms");
	if (!raw) {
		return 0;
	}

	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return 0;
	}

	return Math.min(parsed, MAX_DEBUG_DELAY_MS);
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
