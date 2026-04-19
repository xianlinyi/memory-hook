---
name: memory
description: Manage external memory through agent-memory CLI. Use for /memory ingest <text>, /memory query <text>, save memory, or search memory.
allowed-tools:
  - bash
---

# Use when

- User runs `/memory ingest <text>` to store memory.
- User runs `/memory query <text>` to search memory.

# Inputs

- `mode`: subcommand after `/memory`, must be `ingest` or `query`.
- `text`: everything after `/memory <mode>`.

# Do

1. Parse `/memory <mode> <text>`.
2. If `mode` is `ingest`, run `agent-memory ingest "<text>"` via bash.
3. If `mode` is `query`, run `agent-memory query "<text>"` via bash.
4. Report success output or error output.

# Output

- For ingest: confirmation that memory was ingested, or the CLI error.
- For query: the query result, or the CLI error.

# Rules

- Pass `text` verbatim; do not paraphrase or rewrite.
- If `mode` is missing or not `ingest`/`query`, ask user to use `/memory ingest <text>` or `/memory query <text>`.
- If `text` is missing, ask user for the text argument.
