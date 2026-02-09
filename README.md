# deepwiki-cli

CLI for [DeepWiki](https://deepwiki.com) — query, explore, and manage public GitHub repo documentation from the terminal.

Built on reverse-engineered `api.devin.ai` endpoints. No auth required for public repos.

## Install

```bash
pnpm install
pnpm build
```

Or run directly in development:

```bash
pnpm dev -- query "How does routing work?" -r facebook/react
```

## Commands

### query

Ask a question about one or more repos.

```bash
# Fast mode (default)
deepwiki query "How does auth work?" -r facebook/react

# Multiple repos
deepwiki query "Compare routing approaches" -r facebook/react -r remix-run/react-router

# Deep research mode
deepwiki query "Explain the build system" -r vercel/next.js -m deep

# Codemap mode with Mermaid output
deepwiki query "Show the hooks execution flow" -r facebook/react -m codemap --mermaid

# Stream response as NDJSON
deepwiki query "What is React?" -r facebook/react --stream

# Thread follow-up (reuse query ID)
deepwiki query "Tell me more about that" -r facebook/react --id <previous-query-id>
```

**Flags:**

| Flag | Description |
|------|-------------|
| `-r, --repo <repos...>` | `owner/repo` to query (required, repeatable) |
| `-m, --mode <mode>` | `fast` \| `deep` \| `codemap` (default: `fast`) |
| `-s, --stream` | Stream response chunks as NDJSON via WebSocket |
| `-c, --context <text>` | Additional context for the query |
| `--id <queryId>` | Reuse query ID for thread follow-ups |
| `--no-summary` | Disable summary generation |
| `--mermaid` | Output Mermaid diagram (codemap mode only) |

### get

Retrieve results of a previous query by ID.

```bash
deepwiki get <queryId>
```

### status

Check if a repo is indexed.

```bash
deepwiki status facebook/react
```

### list

Search for indexed repos.

```bash
deepwiki list react
```

### warm

Pre-warm a repo's cache (throttled to once per 10 min server-side).

```bash
deepwiki warm facebook/react
```

## Output

All commands output JSON to stdout. Errors go to stderr as JSON with exit code 1.

```bash
# Pipe to jq
deepwiki list react | jq '.indices[].repo_name'

# Save codemap as Mermaid
deepwiki query "Show data flow" -r org/repo -m codemap --mermaid > diagram.mmd
```

## Modes

| Mode | Engine ID | Description |
|------|-----------|-------------|
| `fast` | `multihop_faster` | Multi-hop RAG, quick answers |
| `deep` | `agent` | Agentic research loop, thorough investigation |
| `codemap` | `codemap` | Structured code traces with file locations |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEEPWIKI_API_URL` | `https://api.devin.ai` | Override API base URL |

## Disclaimer

This tool uses reverse-engineered, undocumented API endpoints. It may break at any time if Cognition changes their API. No auth is required for public repos, but rate limits may apply. Use responsibly.
