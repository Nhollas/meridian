import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { TurnEngine } from "@/lib/turn-engine";
import { createCollectingRegistry } from "../../tests/support/collecting-registry";
import { createHealthRoute } from "./health";

function createStubEngine(overrides: Partial<TurnEngine> = {}): TurnEngine {
	const { registry } = createCollectingRegistry();
	return {
		submit: vi.fn(() => "stub-turn-id"),
		registry,
		...overrides,
	};
}

function createApp(engine: TurnEngine) {
	const app = new Hono();
	app.get("/api/health", createHealthRoute({ engine }));
	return app;
}

describe("GET /api/health", () => {
	it("returns a validation error when the session id contains spaces", async () => {
		const engine = createStubEngine();
		const app = createApp(engine);

		const response = await app.request("/api/health", {
			headers: { "session-id": "bad session id" },
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			errors: ["Missing or invalid sessionId."],
		});
	});

	it("returns a validation error when the session-id header is missing", async () => {
		const engine = createStubEngine();
		const app = createApp(engine);

		const response = await app.request("/api/health");

		expect(response.status).toBe(400);
		const body = (await response.json()) as { errors: string[] };
		expect(body.errors).toHaveLength(1);
	});

	it("returns healthy status and sessionId on a valid request", async () => {
		const engine = createStubEngine();
		const app = createApp(engine);

		const response = await app.request("/api/health", {
			headers: { "session-id": "session-123" },
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			status: string;
			sessionId: string;
			timestamp: string;
		};
		expect(body.status).toBe("healthy");
		expect(body.sessionId).toBe("session-123");
		expect(body.timestamp).toBeDefined();
	});
});
