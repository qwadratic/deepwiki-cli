import { program } from "commander";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = process.env.DEEPWIKI_API_URL ?? "https://api.devin.ai";

const ENGINE_MAP = {
  fast: "multihop_faster",
  deep: "agent",
  codemap: "codemap",
} as const;

type Mode = keyof typeof ENGINE_MAP;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QueryRequest {
  engine_id: string;
  user_query: string;
  keywords: string[];
  repo_names: string[];
  additional_context: string;
  query_id: string;
  use_notes: boolean;
  attached_context: unknown[];
  generate_summary: boolean;
}

interface CodemapLocation {
  id: string;
  lineContent: string;
  path: string;
  lineNumber: number;
  title: string;
  description: string;
}

interface CodemapTrace {
  id: string;
  title: string;
  description: string;
  locations: CodemapLocation[];
}

interface Codemap {
  title: string;
  traces: CodemapTrace[];
  description: string;
  metadata: Record<string, unknown>;
  workspaceInfo: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function err(message: string, extra?: Record<string, unknown>): never {
  process.stderr.write(JSON.stringify({ error: message, ...extra }) + "\n");
  process.exit(1);
}

function out(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

function ndjson(data: unknown): void {
  process.stdout.write(JSON.stringify(data) + "\n");
}

async function api<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    err(`HTTP ${res.status}: ${res.statusText}`, { url, body });
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Codemap → Mermaid converter
// ---------------------------------------------------------------------------

const TRACE_COLORS = [
  ["#e8f5e9", "#4caf50"], // green
  ["#e3f2fd", "#2196f3"], // blue
  ["#fff3e0", "#ff9800"], // orange
  ["#f3e5f5", "#9c27b0"], // purple
  ["#fff8e1", "#ffc107"], // yellow
  ["#fce4ec", "#e91e63"], // pink
  ["#e0f2f1", "#009688"], // teal
  ["#fbe9e7", "#ff5722"], // deep orange
] as const;

function sanitizeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "_");
}

function escapeLabel(s: string): string {
  return s.replace(/"/g, "#quot;").replace(/\n/g, " ");
}

function shortPath(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(idx + 1) : path;
}

export function codemapToMermaid(codemap: Codemap): string {
  const lines: string[] = ["flowchart TB"];
  const { traces } = codemap;

  for (let i = 0; i < traces.length; i++) {
    const trace = traces[i];
    const [fill, stroke] = TRACE_COLORS[i % TRACE_COLORS.length];
    const sgId = sanitizeId(`trace_${trace.id}`);
    const title = escapeLabel(trace.title);

    lines.push("");
    lines.push(`    subgraph ${sgId}["${trace.id}. ${title}"]`);

    for (const loc of trace.locations) {
      const locId = sanitizeId(`loc_${loc.id}`);
      const locTitle = escapeLabel(loc.title);
      const filename = shortPath(loc.path);
      const label = `${locTitle}\\n${filename}:${loc.lineNumber}`;
      lines.push(`        ${locId}["${label}"]`);
    }

    lines.push("    end");

    // Connect locations within trace sequentially
    for (let j = 0; j < trace.locations.length - 1; j++) {
      const a = sanitizeId(`loc_${trace.locations[j].id}`);
      const b = sanitizeId(`loc_${trace.locations[j + 1].id}`);
      lines.push(`    ${a} --> ${b}`);
    }
  }

  // Connect last location of each trace to first of next (dashed)
  for (let i = 0; i < traces.length - 1; i++) {
    const curr = traces[i].locations;
    const next = traces[i + 1].locations;
    if (curr.length && next.length) {
      const a = sanitizeId(`loc_${curr[curr.length - 1].id}`);
      const b = sanitizeId(`loc_${next[0].id}`);
      lines.push(`    ${a} -.-> ${b}`);
    }
  }

  // Styling
  lines.push("");
  for (let i = 0; i < traces.length; i++) {
    const sgId = sanitizeId(`trace_${traces[i].id}`);
    const [fill, stroke] = TRACE_COLORS[i % TRACE_COLORS.length];
    lines.push(
      `    style ${sgId} fill:${fill},stroke:${stroke},stroke-width:2px`,
    );
  }

  return lines.join("\n");
}

function extractCodemap(queryResponse: Record<string, unknown>): Codemap | null {
  const queries = queryResponse.queries as Array<Record<string, unknown>> | undefined;
  if (!queries?.length) return null;
  const response = queries[queries.length - 1].response as Array<Record<string, unknown>> | undefined;
  if (!response) return null;
  for (const chunk of response) {
    if (chunk.type === "chunk" && chunk.data) {
      const data = typeof chunk.data === "string" ? JSON.parse(chunk.data) : chunk.data;
      if (data.traces) return data as Codemap;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function queryCommand(
  question: string,
  opts: {
    repo: string[];
    mode: Mode;
    stream: boolean;
    context?: string;
    id?: string;
    summary: boolean;
    mermaid: boolean;
  },
): Promise<void> {
  const queryId = opts.id ?? randomUUID();
  const engineId = ENGINE_MAP[opts.mode];

  if (!opts.repo.length) err("At least one --repo is required");

  const body: QueryRequest = {
    engine_id: engineId,
    user_query: question,
    keywords: [],
    repo_names: opts.repo,
    additional_context: opts.context ?? "",
    query_id: queryId,
    use_notes: false,
    attached_context: [],
    generate_summary: opts.summary,
  };

  // Submit query
  await api("/ada/query", { method: "POST", body: JSON.stringify(body) });

  if (opts.stream) {
    // Stream via WebSocket
    const wsUrl = `${BASE_URL.replace(/^http/, "ws")}/ada/ws/query/${queryId}`;
    const ws = new WebSocket(wsUrl);

    ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        ndjson(msg);
        if (msg.type === "done" || msg.state === "done") {
          ws.close();
        }
      } catch {
        ndjson({ type: "raw", data: raw.toString() });
      }
    });

    ws.on("error", (e: Error) => err("WebSocket error", { message: e.message }));
    ws.on("close", () => process.exit(0));
  } else {
    // Poll until done
    let result: Record<string, unknown>;
    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      result = await api<Record<string, unknown>>(`/ada/query/${queryId}`);
      const queries = result.queries as Array<Record<string, unknown>> | undefined;
      if (queries?.length) {
        const last = queries[queries.length - 1];
        if (last.state === "done") {
          if (opts.mermaid && opts.mode === "codemap") {
            const codemap = extractCodemap(result);
            if (codemap) {
              process.stdout.write(codemapToMermaid(codemap) + "\n");
              return;
            }
          }
          out(result);
          return;
        }
      }
    }
    err("Query timed out after 240s", { query_id: queryId });
  }
}

async function getCommand(queryId: string): Promise<void> {
  const result = await api(`/ada/query/${queryId}`);
  out(result);
}

async function statusCommand(repo: string): Promise<void> {
  const result = await api(
    `/ada/public_repo_indexing_status?repo_name=${encodeURIComponent(repo)}`,
  );
  out({ repo_name: repo, ...result as object });
}

async function listCommand(search: string): Promise<void> {
  const result = await api(
    `/ada/list_public_indexes?search_repo=${encodeURIComponent(search)}`,
  );
  out(result);
}

async function warmCommand(repo: string): Promise<void> {
  const result = await api(
    `/ada/warm_public_repo?repo_name=${encodeURIComponent(repo)}`,
    { method: "POST" },
  );
  out({ repo_name: repo, ...result as object });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

program
  .name("deepwiki")
  .description("CLI for DeepWiki API")
  .version("0.1.0");

program
  .command("query")
  .description("Query one or more repos")
  .argument("<question>", "Question to ask")
  .requiredOption("-r, --repo <repos...>", "owner/repo (repeatable)")
  .option("-m, --mode <mode>", "fast | deep | codemap", "fast")
  .option("-s, --stream", "Stream response as NDJSON", false)
  .option("-c, --context <context>", "Additional context")
  .option("--id <queryId>", "Reuse query ID for thread follow-ups")
  .option("--no-summary", "Disable summary generation")
  .option("--mermaid", "Output Mermaid diagram (codemap mode only)", false)
  .action(queryCommand);

program
  .command("get")
  .description("Retrieve previous query results")
  .argument("<queryId>", "Query ID to retrieve")
  .action(getCommand);

program
  .command("status")
  .description("Check repo indexing status")
  .argument("<repo>", "owner/repo")
  .action(statusCommand);

program
  .command("list")
  .description("Search indexed repos")
  .argument("<search>", "Search term")
  .action(listCommand);

program
  .command("warm")
  .description("Pre-warm repo cache")
  .argument("<repo>", "owner/repo")
  .action(warmCommand);

program.parse();
