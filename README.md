# memory-hook

GitHub Copilot CLI hook plugin that captures important session facts and ingests them into an external memory CLI.

The default ingest command is:

```sh
agent-memory ingest <memory-file-path>
```

The hook writes a compact JSON list, then passes that file path to `agent-memory ingest`.

## Install

Build the plugin first:

```sh
npm install
npm run build
```

Install it into Copilot CLI:

```sh
copilot plugin install /Users/xianlinyi/dev/src/copilot_plugin/memory_hook
```

If you edit the plugin after installing it, reinstall it so Copilot refreshes its cached copy:

```sh
copilot plugin install /Users/xianlinyi/dev/src/copilot_plugin/memory_hook
```

## Configuration

Environment variables:

- `MEMORY_HOOK_INGEST_CMD`: ingest command prefix. Defaults to `agent-memory ingest`.
- `MEMORY_HOOK_STATE_DIR`: state/cache directory. Defaults to the user cache directory.
- `MEMORY_HOOK_MAX_EVIDENCE_CHARS`: maximum evidence text stored per memory. Defaults to `4000`.
- `MEMORY_HOOK_DEBUG=1`: writes a debug log in the state directory.
- `MEMORY_HOOK_TRACE=1`: writes structured hook-flow events to `<state-dir>/trace.jsonl`, including extracted candidates, cache decisions, ingest decisions, and written memory file paths.

## Behavior

Registered hooks:

- `userPromptSubmitted`: records the submitted user prompt.
- `postToolUse`: records only `ask_user` calls. One `postToolUse` produces one `ask_user` item and one `user_responed` item when both are present.
- `agentStop`: immediately ingests the current list and clears the flow cache.

Each ingested JSON file is just a chronological list:

```json
[
  { "time": 1704614500000, "type": "user_prompt", "content": "Use the build-commit-pr skill." },
  { "time": 1704614610000, "type": "ask_user", "content": "Which base branch should I use?" },
  { "time": 1704614610000, "type": "user_responed", "content": "main" }
]
```

The list is written at `agentStop`; it does not wait for the whole CLI session to finish. A new `userPromptSubmitted` starts a fresh list and discards any previous unflushed items for the same working directory. Ordinary tool calls/results are ignored. Duplicate items are removed. Content is normalized to one line, and content that looks like secrets or tokens is redacted. Successful ingests remove their temporary JSON file from the `ingest/` directory. Hook failures do not block Copilot.

## Trace Hook Flow

Enable trace mode when you want to inspect exactly what the hook records:

```sh
MEMORY_HOOK_TRACE=1
```

The trace file is written to the configured state directory:

```sh
tail -f "$MEMORY_HOOK_STATE_DIR/trace.jsonl"
```

Each JSON line has an `event` field such as `hook.received`, `extract.userPromptSubmitted`, `extract.agentStopFlow`, `agentStop.flowFlushed`, or `ingest.succeeded`.

## Test

```sh
npm test
```
