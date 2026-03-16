import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { TurnEngine } from "@/lib/turn-engine";

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
	createTurnId?: () => string;
	engine: TurnEngine;
};

export function createChatRoute({
	createTurnId = randomUUID,
	engine,
}: ChatRouteDependencies) {
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

		engine.submit({ sessionId, message, turnId });

		return Response.json({ turnId }, { status: 202 });
	};
}
