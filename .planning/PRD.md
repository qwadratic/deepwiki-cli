# DeepWiki CLI — Product Requirements Document

## Overview

A TypeScript CLI tool that provides full programmatic access to DeepWiki's API for querying, exploring, and managing public GitHub repositories. Built on reverse-engineered `api.devin.ai` endpoints with JSON output for scripting and pipeline integration.

## Why Shape A (Thin Fetch Wrapper)

See `SHAPING.md` for the full analysis. TL;DR:
- Personal tool hitting an unofficial API — abstractions don't earn their keep
- Single file is easiest to read, debug, and modify when endpoints change
- ~5 commands, each is a `fetch()` call + JSON print — trivial complexity
- GET polling on `/ada/query/{id}` works for blocking mode (WebSocket optional, added later)

## Spike Results (2026-02-09)

All endpoints verified with bare `curl` — no cookies, no auth.

| Endpoint | Status | Finding |
|----------|:------:|---------|
| `POST /ada/query` | 200 | `attached_context` must be `[]` not `""` |
| `GET /ada/query/{id}` | 200 | Full response with file contents, citations |
| `GET /ada/list_public_indexes` | 200 | Rich metadata (stars, language, topics) |
| `GET /ada/public_repo_indexing_status` | 200 | `{"status":"completed"}` |
| `POST /ada/warm_public_repo` | 200 | `{"status":"OK"}` |
| `POST /ada/index_public_repo` | **400** | reCAPTCHA — **dropped from CLI** |
| Multi-repo `repo_names` array | 200 | Works natively |

---

## CLI Commands (5 total)

### `deepwiki query`

Submit a question about one or more repos.

```
deepwiki query "How does auth work?" -r facebook/react
deepwiki query "Explain routing" -r facebook/react -r remix-run/react-router
deepwiki query "Show data flow" -r org/repo -m codemap
deepwiki query "How does SSR work?" -r vercel/next.js -m deep --stream
deepwiki query "Follow-up question" -r facebook/react --id <previous-query-id>
```

**Flags:**
- `--repo, -r` (required, repeatable) — `owner/repo` to query against
- `--mode, -m` (optional, default: `fast`) — `fast` | `deep` | `codemap`
- `--stream, -s` (optional) — Stream response chunks as NDJSON via WebSocket
- `--context, -c` (optional) — Additional context string
- `--id` (optional) — Reuse a query ID for thread/follow-up queries
- `--no-summary` (optional) — Set `generate_summary: false`
- `--mermaid` (optional) — Output Mermaid flowchart instead of JSON (codemap mode only)

**Blocking output (default):** POST query, poll `GET /ada/query/{id}` until done, print full result.
```json
{
  "query_id": "uuid",
  "engine_id": "multihop_faster",
  "status": "done",
  "response": [...],
  "repo_names": ["facebook/react"]
}
```

**Streaming output (`--stream`):** POST query, open WebSocket, pipe chunks as NDJSON.
```
{"type":"chunk","data":"..."}
{"type":"done","query_id":"uuid"}
```

### `deepwiki get`

Retrieve results of a previously submitted query.

```
deepwiki get <queryId>
```

### `deepwiki status`

Check indexing status for a repo.

```
deepwiki status facebook/react
```

### `deepwiki list`

Search for indexed repos.

```
deepwiki list react
```

### `deepwiki warm`

Pre-warm a repo's cache (throttled server-side to once/10min).

```
deepwiki warm facebook/react
```

---

## Technical Design

### Stack

- **Runtime:** Node.js >=22 (native fetch)
- **Language:** TypeScript (strict mode, ES2024 target)
- **CLI framework:** `commander`
- **WebSocket:** `ws` (for `--stream` only)
- **Build:** `tsup` (ESM, node22 target)
- **Lint/format:** Biome
- **Package manager:** `pnpm`

### Project Structure

```
deepwiki-cli/
  .planning/
    PRD.md          # This file
    SHAPING.md
    STATE.md
  AGENTS.md
  biome.json
  package.json
  tsconfig.json
  tsup.config.ts
  src/
    index.ts        # Everything: types, API calls, mermaid converter, CLI definition
```

Single file. Types at top, helper functions in middle, commander setup at bottom. No abstraction layers.

### Request Payload (Corrected from Spike)

```typescript
interface QueryRequest {
  engine_id: "multihop_faster" | "agent" | "codemap";
  user_query: string;
  keywords: string[];
  repo_names: string[];           // repeatable --repo maps here
  additional_context: string;
  query_id: string;               // crypto.randomUUID()
  use_notes: boolean;
  attached_context: unknown[];    // must be array, not string
  generate_summary: boolean;
}
```

### Engine ID Mapping

```typescript
const ENGINE_MAP = {
  fast: "multihop_faster",
  deep: "agent",
  codemap: "codemap",
} as const;
```

### Blocking Mode (Default)

1. `POST /ada/query` — submit question
2. Poll `GET /ada/query/{id}` every 2s
3. Check if last query in `queries[]` has `state !== "pending"`
4. Print full result JSON to stdout

### Streaming Mode (`--stream`)

1. `POST /ada/query` — submit question
2. Open `wss://api.devin.ai/ada/ws/query/{queryId}`
3. Each WebSocket message → one NDJSON line to stdout
4. On `type === "done"` → close and exit 0

### Error Handling

All errors write JSON to stderr and exit 1:
```json
{"error": "Connection lost", "query_id": "uuid"}
```

### Environment Variables

| Var | Default | Purpose |
|-----|---------|---------|
| `DEEPWIKI_API_URL` | `https://api.devin.ai` | Override base URL |

---

## What's Out

- **`index` command** — reCAPTCHA gated, can't use from CLI
- **Private repos** — no auth flow
- **Markdown/rich output** — JSON only; consumers format as needed
- **Config file** — all options are flags or env vars
