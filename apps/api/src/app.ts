import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAgentService } from "./lib/agent/service";
import { getSandboxRuntime } from "./lib/sandbox/singleton";
import { createSessionStreamRegistry } from "./lib/session-stream-registry";
import { triggerSystemTurn } from "./lib/turn-executor";
import { createChatRoute } from "./routes/chat";
import { createSessionEventsRoute } from "./routes/session-events";

export const app = new Hono();

app.use("*", cors());

const registry = createSessionStreamRegistry();
const handleChat = createChatRoute({ registry });
const handleSessionEvents = createSessionEventsRoute({ registry });

app.post("/api/chat", (c) => handleChat(c.req.raw));
app.get("/api/sessions/:id/events", handleSessionEvents);

export function notifySession({
	sessionId,
	message,
}: {
	sessionId: string;
	message: string;
}): string {
	const runtime = getSandboxRuntime();
	const agentService = createAgentService({ runtime });

	return triggerSystemTurn({ agentService, message, registry, sessionId });
}
