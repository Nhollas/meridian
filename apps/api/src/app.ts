import { Hono } from "hono";
import { cors } from "hono/cors";
import { createChatRoute } from "./routes/chat";

export const app = new Hono();

app.use("*", cors());

const handleChat = createChatRoute();
app.post("/api/chat", (c) => handleChat(c.req.raw));
