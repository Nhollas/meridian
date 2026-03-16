import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
	type CreateAgentService,
	createAgentService as createDefaultAgentService,
} from "@/lib/agent/service";
import type { SandboxRuntime } from "@/lib/sandbox/runtime";
import { getSandboxRuntime } from "@/lib/sandbox/singleton";
import {
	createSessionStreamRegistry,
	type SessionStreamRegistry,
} from "@/lib/session-stream-registry";
import { executeTurn } from "@/lib/turn-executor";

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

		executeTurn({ agentService, message, registry, sessionId, turnId });

		return Response.json({ turnId }, { status: 202 });
	};
}

export const handleChat = createChatRoute();
