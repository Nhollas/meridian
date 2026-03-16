# Known Issues: LangChain/LangGraph Streaming & System-Initiated Turns

## 1. TransformStream Controller Race (LangGraph JS)

**Error:** `Error in handler StreamMessagesHandler, handleLLMNewToken: TypeError [ERR_INVALID_STATE]: Invalid state: Controller is already closed`

When using `streamMode: ["messages", "tools"]`, LangGraph internally creates `StreamMessagesHandler` and `StreamToolsHandler` callback handlers. These handlers push LLM tokens and tool events into `TransformStream` controllers. When the agent finishes, the controllers close — but late LLM token callbacks still fire into the closed controllers, producing the error above.

This is **not catchable** from our code. The error is logged by LangChain's internal callback manager via `console.error`. Our `try/catch` around the stream iteration never sees it.

**Tracked upstream:**
- [langgraphjs#1837](https://github.com/langchain-ai/langgraphjs/issues/1837) — `StreamMessagesHandler` throws `ERR_INVALID_STATE`
- [langgraphjs#1908](https://github.com/langchain-ai/langgraphjs/issues/1908) — Same bug during parallel streaming/abort

**Workaround explored:** Switch to `streamMode: ["updates"]`, which yields state diffs directly from the graph execution loop without callback-based TransformStream controllers. Tradeoff: loses token-by-token streaming (only complete messages after each node finishes). See `feat/sse-event-channel` branch commit `96e6386`.

## 2. System-Initiated Turn Concurrency

**Error:** `400 An assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'`

When a background command completes (e.g. OAuth device flow), `onBackgroundCommandComplete` fires and calls `triggerSystemTurn`. This starts a new LangGraph agent turn on the same `thread_id` (session). If a user turn is still in-flight on that session, two turns run concurrently against the same checkpointed conversation state, and the LLM rejects the corrupted history.

**Reproduction:** Agent starts `meridian auth login --json` with `notifyOnComplete: true` → user authenticates → `waitForBackgroundCommand` resolves → system turn fires while the user's turn may still be streaming.

**Fix required:** A per-session turn queue that serializes user turns and system turns. Both `executeTurn` (from the chat route) and `triggerSystemTurn` (from the notification callback) must go through the same queue so a system turn waits for any in-flight user turn to complete.
