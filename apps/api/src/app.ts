import { Hono } from "hono";
import { cors } from "hono/cors";
import { createSessionEventBus } from "./lib/session-event-bus";
import { createChatRoute } from "./routes/chat";
import { createSessionEventsRoute } from "./routes/session-events";

export const app = new Hono();

app.use("*", cors());

const eventBus = createSessionEventBus();

const handleChat = createChatRoute({ eventBus });
app.post("/api/chat", (c) => handleChat(c.req.raw));

const handleSessionEvents = createSessionEventsRoute({ eventBus });
app.get("/api/sessions/:id/events", (c) => handleSessionEvents(c));
