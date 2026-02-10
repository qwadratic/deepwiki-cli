# AGENTS.md

## Project

TypeScript CLI wrapping DeepWiki's reverse-engineered API (`api.devin.ai`). No auth required for public repos. 5 commands: `query`, `get`, `status`, `list`, `warm`.

## Architecture

**Thin fetch wrapper.** Single source file, no abstraction layers.

```
src/index.ts     # Everything: types, API client, codemap-to-mermaid, CLI (commander)
dist/index.js    # Built output (tsup, ESM, node22 target, shebang)
```

Stack: TypeScript strict, commander, ws (streaming), Biome (lint + format), pnpm, tsup.

## Code Standards

- Run `pnpm check` after code changes (Biome + tsc --noEmit)
- No explicit `any` types
- Use `const` over `let` where possible
- Template literals over string concatenation
- Named constants over magic numbers
- Standard top-level imports only, no inline requires
- Keep single-file structure — don't split into modules

## Git Rules

- Never commit without explicit user approval
- Use `git add <specific-files>`, never `git add -A` or `git add .`
- Never run destructive commands (`--force`, `reset --hard`, `checkout .`)
- Short imperative commit messages

## API Gotchas

- `attached_context` must be `[]` (array), never `""` (string) — returns HTTP 422
- `query_id` must be a proper UUID (`crypto.randomUUID()`)
- `index_public_repo` is reCAPTCHA-gated — unusable from CLI, intentionally excluded
- Codemap returns structured JSON (traces + locations), NOT Mermaid — Mermaid is generated client-side via `codemapToMermaid()`
- Polling: 2s interval, 120 attempts (240s timeout). Codemap typically needs ~50s.
- WebSocket URL: `wss://api.devin.ai/ada/ws/query/{queryId}`

## Planning Docs

All planning/design docs live in `.planning/`:

| File | Purpose |
|------|---------|
| `.planning/PRD.md` | Product requirements, spike results, CLI commands, technical design |
| `.planning/SHAPING.md` | Requirements (R0-R14), shapes (A/B/C), fit check, decision record |
| `.planning/STATE.md` | Implementation state: test results, file tree, remaining work |

After code changes, update `.planning/STATE.md` to reflect current state.

## Won't-Dos

- **Abstraction layers** — no separate API client class, no service layer, no utils
- **Config files** — all options are CLI flags or env vars
- **Private repo auth** — public repos only
- **`index` command** — reCAPTCHA-gated, confirmed unusable
- **Markdown/rich output** — JSON only (exception: `--mermaid` for codemap)
- **Split into multiple files** — single-file CLI is the design decision
- **npm or yarn** — pnpm only

## Build & Run

```bash
pnpm install
pnpm build          # tsup -> dist/index.js
pnpm check          # biome + tsc --noEmit
pnpm dev -- query "How does auth work?" -r facebook/react
```

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `DEEPWIKI_API_URL` | `https://api.devin.ai` | Override API base URL |
