# DeepWiki CLI — Shaping

## Source

> PRD at `./PRD.md` — reverse-engineered DeepWiki API surface from `DeepWiki.com Architecture.md`.
> User chose: full direct API coverage (not MCP-only), JSON output, both streaming and blocking modes.

---

## Frame

### Problem

- No CLI/scriptable way to query DeepWiki — it's browser-only
- Can't pipe DeepWiki results into other tools (jq, scripts, CI pipelines)
- No way to programmatically check repo indexing status or trigger indexing
- Mode selection (fast/deep/codemap) is only available through the web UI

### Outcome

- A single CLI binary covers the DeepWiki API surface (minus reCAPTCHA-gated endpoints)
- Query any public repo (or multiple repos) in any mode from the terminal
- JSON output is composable with unix tools
- Streaming and blocking modes serve different use cases (interactive vs scripting)

---

## Spike Results (2026-02-09)

All endpoints tested with bare `curl` — no cookies, no auth headers.

| Endpoint | Method | HTTP Status | Notes |
|----------|--------|:-----------:|-------|
| `/ada/query` | POST | 200 | `attached_context` must be `[]` not `""` |
| `/ada/query/{id}` | GET | 200 | Returns full response with file contents, citations, markdown |
| `/ada/list_public_indexes` | GET | 200 | Rich metadata: description, stars, language, topics |
| `/ada/public_repo_indexing_status` | GET | 200 | Returns `{"status":"completed"}` |
| `/ada/warm_public_repo` | POST | 200 | Returns `{"status":"OK"}` |
| `/ada/index_public_repo` | POST | **400** | **Blocked by reCAPTCHA** — unusable from CLI |
| Multi-repo `repo_names` | POST | 200 | `["facebook/react","remix-run/react-router"]` works natively |

**Key findings:**
- Zero auth needed for all working endpoints
- `index` endpoint is gated by reCAPTCHA — R7 is **Out**
- Multi-repo (R14) works natively in the `repo_names` array
- GET polling on `/ada/query/{id}` returns complete results — viable blocking mode without WebSocket
- WebSocket not yet tested but GET polling is a solid fallback

---

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| R0 | Query public repos with a question and get an answer | Core goal |
| R1 | Support all three engine modes: fast, deep, codemap | Must-have |
| R2 | JSON output to stdout for all commands | Must-have |
| R3 | Stream response chunks as NDJSON in real-time | Must-have |
| R4 | Also support blocking mode (wait for complete response) | Must-have |
| R5 | Thread/follow-up queries using same query ID | Nice-to-have |
| R6 | Check repo indexing status | Nice-to-have |
| R7 | ~~Request indexing of a new repo~~ | **Out** (reCAPTCHA) |
| R8 | Pre-warm a repo's cache | Nice-to-have |
| R9 | List/search indexed repos | Nice-to-have |
| R10 | Retrieve a previous query's results by ID | Nice-to-have |
| R11 | Zero auth required (public repos only) | Must-have |
| R12 | Errors as JSON to stderr, exit code 1 | Must-have |
| R13 | Base URL overridable via env var | Nice-to-have |
| R14 | Query multiple repos in a single request (repeatable --repo flag) | Must-have |

---

## Shapes

### A: Thin fetch wrapper (single file)

One `src/index.ts` file. All commands as functions, commander at bottom. No abstraction layers. `fetch()` for HTTP, `ws` for WebSocket.

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **A1** | Single entry file with all command handlers inline | |
| **A2** | `fetch()` calls to each endpoint, response parsed and printed | |
| **A3** | `ws` package opens WebSocket, pipes chunks to stdout as NDJSON | |
| **A4** | Commander CLI definition at bottom of same file | |

### B: Layered client (api module + command modules)

Separate `api.ts` client class, individual command files under `commands/`, shared `types.ts`. The PRD's proposed structure.

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **B1** | `api.ts` — `DeepWikiClient` class wrapping all endpoints | |
| **B2** | `types.ts` — interfaces for request/response shapes | |
| **B3** | `commands/*.ts` — one file per command, each calls client | |
| **B4** | `cli.ts` — commander setup, wires commands | |
| **B5** | WebSocket streaming in client, returns AsyncIterator | ⚠️ |

### C: Single-command CLI (query only, flags for everything)

Only implement the `query` command. Status/warm/list are just `--action` flags or omitted. Minimal surface, fastest to build.

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **C1** | Single `query` command covers R0-R4, R14 | |
| **C2** | Management actions (warm, status, list) via `--action` flag | |
| **C3** | No separate command files — all in one entry point | |

---

## Fit Check

| Req | Requirement | Status | A | B | C |
|-----|-------------|--------|---|---|---|
| R0 | Query public repos with a question and get an answer | Core goal | ✅ | ✅ | ✅ |
| R1 | Support all three engine modes: fast, deep, codemap | Must-have | ✅ | ✅ | ✅ |
| R2 | JSON output to stdout for all commands | Must-have | ✅ | ✅ | ✅ |
| R3 | Stream response chunks as NDJSON in real-time | Must-have | ✅ | ✅ | ✅ |
| R4 | Also support blocking mode (wait for complete response) | Must-have | ✅ | ✅ | ✅ |
| R5 | Thread/follow-up queries using same query ID | Nice-to-have | ✅ | ✅ | ✅ |
| R6 | Check repo indexing status | Nice-to-have | ✅ | ✅ | ❌ |
| R8 | Pre-warm a repo's cache | Nice-to-have | ✅ | ✅ | ❌ |
| R9 | List/search indexed repos | Nice-to-have | ✅ | ✅ | ❌ |
| R10 | Retrieve a previous query's results by ID | Nice-to-have | ✅ | ✅ | ❌ |
| R11 | Zero auth required (public repos only) | Must-have | ✅ | ✅ | ✅ |
| R12 | Errors as JSON to stderr, exit code 1 | Must-have | ✅ | ✅ | ✅ |
| R13 | Base URL overridable via env var | Nice-to-have | ✅ | ✅ | ✅ |
| R14 | Query multiple repos in a single request (repeatable --repo flag) | Must-have | ✅ | ✅ | ✅ |

**Notes:**
- R7 removed (Out — reCAPTCHA gated)
- C fails R6, R8-R10: Management commands omitted or crammed into `--action` flag
- B5 flagged: WebSocket streaming needs investigation, but GET polling is a proven fallback

---

## Decision

**Selected: Shape A (Thin fetch wrapper)**

Rationale:
- This is a personal CLI tool hitting an unofficial API — abstractions don't earn their keep here
- Single file is easiest to read, debug, and modify when the API inevitably changes
- ~5 commands, each is a `fetch()` call + JSON print — no complexity to manage
- B's layered structure (client class, types file, command files) is overhead for what amounts to 200 lines of code
- C drops nice-to-haves unnecessarily — the management commands are trivial one-liners
- WebSocket can be added later; GET polling works now for blocking mode

The ⚠️ on B5 becomes moot — in Shape A, streaming is just opening a `ws` connection and piping lines to stdout, no AsyncIterator abstraction needed.
