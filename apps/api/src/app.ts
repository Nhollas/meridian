import { Hono } from "hono";
import { cors } from "hono/cors";
import { createTurnEngine } from "./lib/turn-engine";
import { createChatRoute } from "./routes/chat";
import { createSessionEventsRoute } from "./routes/session-events";

export const app = new Hono();

app.use("*", cors());

const engine = createTurnEngine();

const handleChat = createChatRoute({ engine });
const handleSessionEvents = createSessionEventsRoute({
	registry: engine.registry,
});

app.post("/api/chat", (c) => handleChat(c.req.raw));
app.get("/api/sessions/:id/events", handleSessionEvents);
