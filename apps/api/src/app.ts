import { Hono } from "hono";
import { cors } from "hono/cors";
import { createSessionStreamRegistry } from "./lib/session-stream-registry";
import { createChatRoute } from "./routes/chat";
import { createSessionEventsRoute } from "./routes/session-events";

export const app = new Hono();

app.use("*", cors());

const registry = createSessionStreamRegistry();
const handleChat = createChatRoute({ registry });
const handleSessionEvents = createSessionEventsRoute({ registry });

app.post("/api/chat", (c) => handleChat(c.req.raw));
app.get("/api/sessions/:id/events", handleSessionEvents);
