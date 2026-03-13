# Meridian Agent Reference

This document is the authoritative reference for the current Meridian agent surface exposed by the API. It describes the `/api/chat` contract, streamed event behaviour, session model, and the runtime-backed capabilities the agent can use today. It should track what the application does today.

## Scope

The current agent surface supports:

- one chat endpoint at `POST /api/chat`
- newline-delimited JSON streaming of runtime events
- caller-provided session continuity via `sessionId`
- runtime-backed tool use for command execution, background command management, and workspace file access

The current implementation is still local-runtime oriented. Session history is stored in process memory and does not survive an application restart.

## Defined Terms

These terms are used throughout the agent reference and retain their runtime meaning:

| Term | Description |
| --- | --- |
| **Session** | A caller-defined conversation key supplied as `sessionId`. The server uses it to look up prior turns and continue the same chat. |
| **Turn** | One user message plus the streamed agent work and final outcome produced in response to that message. |
| **Runtime Event** | A single newline-delimited JSON object emitted by `/api/chat` while a turn is in progress. |
| **Tool Call** | A recorded invocation of one of the agent's runtime tools, such as `run_command` or `read_file`. |
| **Background Command** | A command that continues running inside the runtime after the first useful stdout line has been returned. |

## Common Behaviour

### Transport And Content Type

`POST /api/chat` accepts a JSON request body and, on success, returns a streamed `application/x-ndjson` response.

- Each response line is one complete JSON event object.
- Events are ordered by the `sequence` field.
- The stream closes when the turn reaches either `turn.completed` or `turn.failed`.

Validation failures are different from streamed turn failures.

- Request validation errors return a normal JSON response with HTTP `400`.
- Turn failures after request validation return HTTP `200` and emit a streamed `turn.failed` event.

### Session Model

The caller must provide the `Session-Id` header on every request.

- `Session-Id` must match `^[A-Za-z0-9_-]+$`
- empty values are rejected
- the same `sessionId` continues the same conversation history
- a different `sessionId` starts a new conversation

Current session storage behaviour:

- conversation history is stored in process memory
- history is lost if the application restarts
- there is no durable task or conversation store yet

### Conversation History

When the server receives a new message for an existing session, it replays the stored conversation into the agent before running the new turn.

Stored assistant turns include:

- the final assistant content
- any recorded tool calls from that turn

This means later turns can continue from earlier runtime work rather than relying only on plain text chat history.

### Partial Progress And Failure Recovery

If the agent streams meaningful assistant text and then fails before producing a normal final result, the server persists that streamed text as the completed assistant turn and emits `turn.completed` instead of `turn.failed`.

This behaviour exists so the conversation can continue cleanly when a turn has already produced useful user-visible progress, such as initiating a login flow and then waiting for the user to complete it elsewhere.

## Endpoint

### `POST /api/chat`

Submits one user message to the current session and streams runtime events for the resulting agent turn.

```bash
curl -N http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -H 'Session-Id: session-123' \
  -d '{
    "message": "Find me a broadband quote"
  }'
```

Required headers:

- `Session-Id`: required string used to continue or create a conversation session (must match `^[A-Za-z0-9_-]+$`)

Request body:

```json
{
  "message": "Find me a broadband quote"
}
```

Fields:

- `message`: required non-empty user message

Behaviour:

- validates the `Session-Id` header and `message`
- loads any stored conversation history for the session
- appends the new user message to the history sent to the agent
- streams runtime events as the turn progresses
- persists the completed user and assistant turn in the in-memory conversation store when the turn completes successfully

Success response:

- status: `200`
- content type: `application/x-ndjson; charset=utf-8`

Validation error responses:

```json
{
  "error": "Missing or invalid sessionId."
}
```

```json
{
  "error": "Missing or invalid message."
}
```

## Streamed Runtime Events

Every streamed line is a runtime event envelope with the same top-level shape:

```json
{
  "id": "evt_123",
  "type": "assistant.delta",
  "sessionId": "session-123",
  "turnId": "e7fd0e7f-2ad4-4f25-88ad-69004c1246be",
  "sequence": 1,
  "timestamp": "2026-03-10T12:00:00.000Z",
  "payload": {}
}
```

Envelope fields:

- `id`: unique event identifier
- `type`: event family for the line
- `sessionId`: echoed session identifier from the request
- `turnId`: unique identifier for the current turn
- `sequence`: one-based event order within the turn
- `timestamp`: ISO 8601 timestamp with offset
- `payload`: event-specific body

### `assistant.delta`

Emitted when the agent streams assistant text before the turn is complete.

Payload:

```json
{
  "delta": "Working through the options..."
}
```

### `tool.started`

Emitted when the agent starts a runtime tool call.

Payload:

```json
{
  "toolCall": {
    "id": "tool-1",
    "name": "run_command",
    "input": "{\"command\":[\"meridian\",\"products\",\"list\",\"--json\"]}"
  }
}
```

### `tool.completed`

Emitted when the agent completes a runtime tool call successfully.

Payload:

```json
{
  "toolCall": {
    "id": "tool-1",
    "name": "run_command",
    "input": "{\"command\":[\"meridian\",\"products\",\"list\",\"--json\"]}",
    "output": "{\"stdout\":\"{\\\"products\\\":[...]}\",\"stderr\":\"\",\"exitCode\":0}"
  }
}
```

### `tool.failed`

Emitted when a runtime tool call fails.

Payload:

```json
{
  "toolCall": {
    "id": "tool-2",
    "name": "run_command",
    "input": "{\"command\":[\"meridian\",\"proposals\",\"create\"]}",
    "output": "{\"error\":\"command exited with code 1\"}"
  }
}
```

### `turn.completed`

Emitted once at the end of a successful turn.

Payload:

```json
{
  "content": "I found 2 offers worth comparing.",
  "toolCalls": [
    {
      "id": "tool-1",
      "name": "read_file",
      "input": "{\"path\":\"offers.json\"}",
      "output": "{\"offers\":2}",
      "state": "completed"
    }
  ]
}
```

`toolCalls` is the final tool timeline for the turn. The optional `state` field may be `running`, `completed`, or `failed`.

### `turn.failed`

Emitted once at the end of a failed turn when no meaningful assistant progress was completed first.

Payload:

```json
{
  "error": "agent exploded"
}
```

If the underlying error message is empty, the server falls back to:

```json
{
  "error": "Unknown error"
}
```

## Event Ordering

Within one turn:

- `sequence` always starts at `1`
- `assistant.delta` and tool events may be interleaved
- `turn.completed` or `turn.failed` is always the final event
- event ordering is per-turn, not global across sessions

Typical successful sequence:

1. one or more `assistant.delta` events
2. zero or more `tool.started`, `tool.completed`, or `tool.failed` events
3. one final `turn.completed`

Typical failed sequence:

1. zero or more `assistant.delta` and tool events
2. one final `turn.failed`, unless partial assistant progress was promoted into a completed turn instead

## Agent Behaviour

The current agent is runtime-grounded rather than domain-hardcoded.

Behaviourally, it:

- fetches runtime instructions at the start of a new session before exploring capabilities
- avoids fetching runtime instructions again on later turns unless the user explicitly asks to refresh them or an earlier fetch failed
- prefers the smallest read-only step that moves the task forward
- inspects help before using a command it does not understand
- executes routine, reversible prerequisite steps without waiting for confirmation
- asks the user when required information is missing or when the next step has meaningful external side effects
- can initiate background work, continue other useful work, and then inspect or wait on that background work later

### Tool Loop Guards

The current implementation applies basic loop protection inside a turn.

- the exact same tool call is rejected if the agent tries to repeat it in the same turn
- a turn is limited to `12` tool calls
- the underlying agent recursion limit is `20`

If the recursion limit is hit, the turn still completes with an explanatory assistant message and the recorded tool timeline rather than surfacing a raw runtime error.

## Runtime Tool Surface

The agent currently has access to these runtime tools:

| Tool | Description |
| --- | --- |
| `get_runtime_instructions` | Reads runtime-provided guidance for the current session. |
| `run_command` | Runs a command inside the sandbox runtime. |
| `list_background_commands` | Lists tracked background commands for the session. |
| `inspect_background_command` | Inspects one background command, including buffered output and current status. |
| `wait_for_background_command` | Waits for a background command to finish or until a timeout elapses. |
| `terminate_background_command` | Terminates a running background command and returns final buffered output. |
| `list_directory` | Lists files and directories inside the session workspace. |
| `read_file` | Reads a file from the session workspace. |
| `write_file` | Writes a file into the session workspace. |

`run_command` supports two wait modes:

- `exit`: wait for full command completion
- `first-stdout-line`: return after the first stdout line

When `run_command` is called with `waitFor: "first-stdout-line"` and `keepAlive: true`, the runtime may return a `backgroundCommandId`. The agent can then manage that work through the background-command tools.

## Example Stream

This is a representative successful response stream:

```json
{"id":"evt-1","type":"assistant.delta","sessionId":"session-123","turnId":"turn-1","sequence":1,"timestamp":"2026-03-10T12:00:00.000Z","payload":{"delta":"Working through the options..."}}
{"id":"evt-2","type":"tool.completed","sessionId":"session-123","turnId":"turn-1","sequence":2,"timestamp":"2026-03-10T12:00:01.000Z","payload":{"toolCall":{"id":"tool-1","name":"read_file","input":"{\"path\":\"offers.json\"}","output":"{\"offers\":2}"}}}
{"id":"evt-3","type":"turn.completed","sessionId":"session-123","turnId":"turn-1","sequence":3,"timestamp":"2026-03-10T12:00:02.000Z","payload":{"content":"I found 2 offers worth comparing.","toolCalls":[{"id":"tool-1","name":"read_file","input":"{\"path\":\"offers.json\"}","output":"{\"offers\":2}","state":"completed"}]}}
```

Consumers should treat the event stream as append-only for the current turn and render the final answer from `turn.completed` when it arrives.

## Current Limitations

The current agent surface is intentionally narrower than the long-term runtime direction.

- session history is in-memory only and resets on process restart
- there is no separate task API yet
- there is no dedicated approvals or artifacts contract yet
- `/api/chat` is the only current consumer-facing agent endpoint

Those capabilities may be added later, but they are not part of the current agent contract.
