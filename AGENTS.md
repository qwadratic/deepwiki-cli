# AGENTS.md

## Project

TypeScript CLI wrapping DeepWiki's reverse-engineered API (`api.devin.ai`). No auth required for public repos. 5 commands: `query`, `get`, `status`, `list`, `warm`.

## Architecture

**Shape A: Thin fetch wrapper.** Single source file, no abstraction layers.

```
src/index.ts     # Everything: types, API client, codemap-to-mermaid, CLI (commander)
dist/index.js    # Built output (tsup, ESM, node18 target, shebang)
```

Stack: TypeScript strict, commander, ws (streaming), pnpm, tsup.

## API Gotchas

- `attached_context` must be `[]` (array), never `""` (string) -- returns HTTP 422
- `query_id` must be a proper UUID (`crypto.randomUUID()`)
- `index_public_repo` is reCAPTCHA-gated -- unusable from CLI, intentionally excluded
- Codemap returns structured JSON (traces + locations), NOT Mermaid -- Mermaid is generated client-side via `codemapToMermaid()`
- Polling: 2s interval, 120 attempts (240s timeout). Codemap typically needs ~50s.
- WebSocket URL: `wss://api.devin.ai/ada/ws/query/{queryId}`

## Planning Docs

All planning/design docs live in `.planning/`:

| File | Purpose |
|------|---------|
| `.planning/PRD.md` | Product requirements, spike results, CLI commands, technical design |
| `.planning/SHAPING.md` | Requirements (R0-R14), shapes (A/B/C), fit check, decision record |
| `.planning/STATE.md` | Implementation state: test results, file tree, remaining work |

## Mandatory: Keep STATE.md Up to Date

After ANY code change, update `.planning/STATE.md` to reflect:
- Current file tree
- Test results (what passes, what's untested)
- Remaining work / known issues
- Any new spike findings

STATE.md is the ground truth for project status. It must never go stale.

## Won't-Dos

Do NOT:
- **Add abstraction layers** -- no separate API client class, no service layer, no utils. Everything stays in `src/index.ts`.
- **Add config files** -- all options are CLI flags or env vars. No `.deepwikirc`, no `config.json`.
- **Add private repo auth** -- this tool is for public repos only. No token handling, no OAuth.
- **Add `index` command** -- reCAPTCHA-gated, confirmed unusable (spike 2026-02-09).
- **Add Markdown/rich output** -- JSON only. Consumers format as needed. Exception: `--mermaid` flag for codemap.
- **Split into multiple files** -- single-file CLI is the design decision (Shape A). Don't refactor into modules.
- **Add tests framework** -- manual `curl`/CLI testing is sufficient for 5 thin wrapper commands.
- **Use npm or yarn** -- pnpm only.

## Build & Run

```bash
pnpm install
pnpm build          # tsup -> dist/index.js
pnpm dev -- query "How does auth work?" -r facebook/react
```

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `DEEPWIKI_API_URL` | `https://api.devin.ai` | Override API base URL |
