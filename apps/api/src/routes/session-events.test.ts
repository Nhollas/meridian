import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { SessionStreamRegistry } from "@/lib/session-stream-registry";
import { createSessionEventsRoute } from "./session-events";

function createStubRegistry(
	overrides: Partial<SessionStreamRegistry> = {},
): SessionStreamRegistry {
	return {
		register: vi.fn(),
		unregister: vi.fn(),
		writeEvent: vi.fn(),
		...overrides,
	};
}

function createApp(registry: SessionStreamRegistry) {
	const app = new Hono();
	app.get("/api/sessions/:id/events", createSessionEventsRoute({ registry }));
	return app;
}

describe("GET /api/sessions/:id/events", () => {
	it("returns a validation error when the session id contains spaces", async () => {
		const registry = createStubRegistry();
		const app = createApp(registry);

		const response = await app.request(
			"/api/sessions/bad%20session%20id/events",
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			errors: ["Missing or invalid sessionId."],
		});
	});

	it("returns a validation error when the session id is empty", async () => {
		const registry = createStubRegistry();
		const app = createApp(registry);

		const response = await app.request("/api/sessions/%20/events");

		expect(response.status).toBe(400);
		const body = (await response.json()) as { errors: string[] };
		expect(body.errors).toContain("Missing or invalid sessionId.");
	});

	it("opens an SSE stream and registers the session on a valid request", async () => {
		const registry = createStubRegistry();
		const app = createApp(registry);

		const response = await app.request("/api/sessions/session-123/events");

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/event-stream");
		expect(registry.register).toHaveBeenCalledWith(
			"session-123",
			expect.any(Object),
		);
	});
});
