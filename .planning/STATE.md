# DeepWiki CLI — Implementation State

**Date:** 2026-02-09
**Shape:** A (Thin fetch wrapper, single `src/index.ts`)

## Test Results

| Command | Status | Verified |
|---------|:------:|----------|
| `deepwiki status <repo>` | PASS | Returns `{"status":"completed"}` |
| `deepwiki warm <repo>` | PASS | Returns `{"status":"OK"}` |
| `deepwiki list <search>` | PASS | Returns rich metadata (stars, language, topics) |
| `deepwiki query <q> -r <repo>` (blocking) | PASS | Polls until done, 89 response chunks |
| `deepwiki query ... --mermaid -m codemap` | PASS | Outputs valid Mermaid flowchart, renders to SVG |
| `deepwiki query ... --stream` | UNTESTED | WebSocket path implemented but not verified |
| `deepwiki query ... --id <id>` (threads) | UNTESTED | Thread follow-up path implemented but not verified |
| `deepwiki get <queryId>` | UNTESTED | Implemented, not yet called against live API |
| Multi-repo `-r a -r b` | UNTESTED via CLI | Verified at API level with curl (works) |

## Build

- `pnpm build` succeeds — `dist/index.js` at 7.08 KB
- `pnpm dev` works via tsx for development
- Note: `pnpm approve-builds` needed for esbuild on first install

## Files

```
deepwiki-cli/
  PRD.md              # Product requirements (updated post-spike)
  SHAPING.md          # Shape analysis, spike results, decision rationale
  STATE.md            # This file
  package.json
  tsconfig.json
  tsup.config.ts
  pnpm-lock.yaml
  pnpm-workspace.yaml
  src/
    index.ts          # Full CLI implementation (~340 lines)
  dist/
    index.js          # Built output
```

## Remaining Work

1. **Verify streaming** (`--stream` via WebSocket)
2. **Verify thread follow-ups** (`--id` reuse)
3. **Verify `get` command** against live API
4. **Verify multi-repo** via CLI flags (API-level already confirmed)
5. **Test built binary** — `chmod +x dist/index.js` and run via `./dist/index.js`

## Spike Findings (Baked Into Implementation)

- `attached_context` must be `[]` not `""` — fixed in code
- `index` endpoint blocked by reCAPTCHA — dropped from CLI
- Blocking mode uses GET polling (2s interval, 120 attempts = 240s timeout)
- Codemap always returns 1 JSON chunk with N traces, even for multi-topic prompts
- Playground links (Vercel URLs) are auth-gated — ignored in output
- Codemap JSON has no Mermaid — `--mermaid` flag generates it client-side from traces structure
