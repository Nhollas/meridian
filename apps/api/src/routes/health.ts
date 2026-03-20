import type { Context } from "hono";
import { createTurnEngine } from "../lib/turn-engine";

export function createHealthRoute() {
	return async (c: Context) => {
		const sessionId = c.req.header("session-id");

		if (!sessionId || sessionId.length === 0) {
			return c.json({ errors: ["Missing session-id header"] }, 400);
		}

		if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) {
			return c.json({ errors: ["Invalid session-id format"] }, 400);
		}

		try {
			const engine = createTurnEngine();
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
