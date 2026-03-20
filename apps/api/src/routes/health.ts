import type { Context } from "hono";
import { z } from "zod";
import type { TurnEngine } from "../lib/turn-engine";

const sessionIdSchema = z
	.string()
	.min(1, "Missing session-id header")
	.regex(/^[A-Za-z0-9_-]+$/, "Invalid session-id format");

export function createHealthRoute({ engine }: { engine: TurnEngine }) {
	return async (c: Context) => {
		const sessionIdResult = sessionIdSchema.safeParse(
			c.req.header("session-id"),
		);

		if (!sessionIdResult.success) {
			const errors = sessionIdResult.error.issues.map((issue) => issue.message);
			return c.json({ errors }, 400);
		}

		const sessionId = sessionIdResult.data;

		try {
			const status = engine.registry ? "healthy" : "degraded";

			return c.json({
				status,
				sessionId,
				timestamp: new Date().toISOString(),
			});
		} catch (error) {
			console.error("Health check failed:", error);
			return c.json({ errors: ["Internal server error"] }, 500);
		}
	};
}
