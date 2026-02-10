# deepwiki-cli

CLI for [DeepWiki](https://deepwiki.com) — query, explore, and manage public GitHub repo documentation from the terminal.

Built on reverse-engineered `api.devin.ai` endpoints. No auth required for public repos.

## Install

```bash
npm install -g @qwadratic/deepwiki-cli
```

Or use directly with npx:

```bash
npx @qwadratic/deepwiki-cli query "How does routing work?" -r facebook/react
```

### From source

```bash
git clone https://github.com/qwadratic/deepwiki-cli.git
cd deepwiki-cli
pnpm install
pnpm build
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

## Why not use DeepWiki MCP?

The DeepWiki MCP exposes two tools: ask a question and retrieve a full wiki page. That covers the simplest use case but loses what makes DeepWiki actually useful — iterating on queries, switching between fast/deep/codemap modes, drawing code trace diagrams, and threading follow-up questions to narrow down an answer. This CLI reproduces that full workflow and makes it agent-friendly: a coding agent can warm a repo, check indexing status, query in codemap mode, pipe the result through `jq`, and follow up — all as composable shell commands.

## Why not use existing `deepwiki-cli`?

The [`deepwiki-cli`](https://www.npmjs.com/package/deepwiki-cli) package on npm retrieves docs via the DeepWiki MCP SSE protocol. It adds an intermediate layer (MCP) between you and the API, supports only basic Q&A, and doesn't expose mode selection, codemap traces, streaming, or any of the management commands. This package calls the API directly.

<details>
<summary>On MCP wrappers in general</summary>

MCP servers load all tool descriptions into the context window on every session. Popular ones consume 7-9% of the context before any work begins, and this overhead compounds on every turn. When a CLI already exists, wrapping it in MCP adds a protocol layer that costs tokens without adding capability.

LLMs already know standard CLI tools from training data. A CLI that outputs JSON to stdout is composable (`| jq`, `| grep`), needs no protocol negotiation, and lets agents pay the token cost only when they actually invoke the tool — not on every turn.

As Mario Zechner (pi-coding-agent) puts it: "Just like a lot of meetings could have been emails, a lot of MCPs could have been CLI invocations." His benchmarks show CLI tools run ~30% cheaper than equivalent MCP wrappers at the same success rate.

References:
- [MCP vs CLI: Benchmarking Tools for Coding Agents](https://mariozechner.at/posts/2025-08-15-mcp-vs-cli/) — Mario Zechner
- [What I learned building a minimal coding agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/) — Mario Zechner
- [Why Top Engineers Are Ditching MCP Servers](https://www.flowhunt.io/blog/why-top-engineers-are-ditching-mcp-servers/) — FlowHunt
- [Excessive context usage for tools](https://github.com/github/github-mcp-server/issues/1286) — GitHub MCP Server

</details>

## Disclaimer

This tool uses reverse-engineered, undocumented API endpoints. It may break at any time if Cognition changes their API. No auth is required for public repos, but rate limits may apply. Use responsibly.
