#!/usr/bin/env node

// src/index.ts
import { program } from "commander";
import { randomUUID } from "crypto";
import WebSocket from "ws";
var BASE_URL = process.env.DEEPWIKI_API_URL ?? "https://api.devin.ai";
var ENGINE_MAP = {
  fast: "multihop_faster",
  deep: "agent",
  codemap: "codemap"
};
function err(message, extra) {
  process.stderr.write(JSON.stringify({ error: message, ...extra }) + "\n");
  process.exit(1);
}
function out(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}
function ndjson(data) {
  process.stdout.write(JSON.stringify(data) + "\n");
}
async function api(path, options) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    err(`HTTP ${res.status}: ${res.statusText}`, { url, body });
  }
  return res.json();
}
var TRACE_COLORS = [
  ["#e8f5e9", "#4caf50"],
  // green
  ["#e3f2fd", "#2196f3"],
  // blue
  ["#fff3e0", "#ff9800"],
  // orange
  ["#f3e5f5", "#9c27b0"],
  // purple
  ["#fff8e1", "#ffc107"],
  // yellow
  ["#fce4ec", "#e91e63"],
  // pink
  ["#e0f2f1", "#009688"],
  // teal
  ["#fbe9e7", "#ff5722"]
  // deep orange
];
function sanitizeId(s) {
  return s.replace(/[^a-zA-Z0-9]/g, "_");
}
function escapeLabel(s) {
  return s.replace(/"/g, "#quot;").replace(/\n/g, " ");
}
function shortPath(path) {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(idx + 1) : path;
}
function codemapToMermaid(codemap) {
  const lines = ["flowchart TB"];
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
    for (let j = 0; j < trace.locations.length - 1; j++) {
      const a = sanitizeId(`loc_${trace.locations[j].id}`);
      const b = sanitizeId(`loc_${trace.locations[j + 1].id}`);
      lines.push(`    ${a} --> ${b}`);
    }
  }
  for (let i = 0; i < traces.length - 1; i++) {
    const curr = traces[i].locations;
    const next = traces[i + 1].locations;
    if (curr.length && next.length) {
      const a = sanitizeId(`loc_${curr[curr.length - 1].id}`);
      const b = sanitizeId(`loc_${next[0].id}`);
      lines.push(`    ${a} -.-> ${b}`);
    }
  }
  lines.push("");
  for (let i = 0; i < traces.length; i++) {
    const sgId = sanitizeId(`trace_${traces[i].id}`);
    const [fill, stroke] = TRACE_COLORS[i % TRACE_COLORS.length];
    lines.push(
      `    style ${sgId} fill:${fill},stroke:${stroke},stroke-width:2px`
    );
  }
  return lines.join("\n");
}
function extractCodemap(queryResponse) {
  const queries = queryResponse.queries;
  if (!queries?.length) return null;
  const response = queries[queries.length - 1].response;
  if (!response) return null;
  for (const chunk of response) {
    if (chunk.type === "chunk" && chunk.data) {
      const data = typeof chunk.data === "string" ? JSON.parse(chunk.data) : chunk.data;
      if (data.traces) return data;
    }
  }
  return null;
}
async function queryCommand(question, opts) {
  const queryId = opts.id ?? randomUUID();
  const engineId = ENGINE_MAP[opts.mode];
  if (!opts.repo.length) err("At least one --repo is required");
  const body = {
    engine_id: engineId,
    user_query: question,
    keywords: [],
    repo_names: opts.repo,
    additional_context: opts.context ?? "",
    query_id: queryId,
    use_notes: false,
    attached_context: [],
    generate_summary: opts.summary
  };
  await api("/ada/query", { method: "POST", body: JSON.stringify(body) });
  if (opts.stream) {
    const wsUrl = `${BASE_URL.replace(/^http/, "ws")}/ada/ws/query/${queryId}`;
    const ws = new WebSocket(wsUrl);
    ws.on("message", (raw) => {
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
    ws.on("error", (e) => err("WebSocket error", { message: e.message }));
    ws.on("close", () => process.exit(0));
  } else {
    let result;
    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise((r) => setTimeout(r, 2e3));
      result = await api(`/ada/query/${queryId}`);
      const queries = result.queries;
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
async function getCommand(queryId) {
  const result = await api(`/ada/query/${queryId}`);
  out(result);
}
async function statusCommand(repo) {
  const result = await api(
    `/ada/public_repo_indexing_status?repo_name=${encodeURIComponent(repo)}`
  );
  out({ repo_name: repo, ...result });
}
async function listCommand(search) {
  const result = await api(
    `/ada/list_public_indexes?search_repo=${encodeURIComponent(search)}`
  );
  out(result);
}
async function warmCommand(repo) {
  const result = await api(
    `/ada/warm_public_repo?repo_name=${encodeURIComponent(repo)}`,
    { method: "POST" }
  );
  out({ repo_name: repo, ...result });
}
program.name("deepwiki").description("CLI for DeepWiki API").version("0.1.0");
program.command("query").description("Query one or more repos").argument("<question>", "Question to ask").requiredOption("-r, --repo <repos...>", "owner/repo (repeatable)").option("-m, --mode <mode>", "fast | deep | codemap", "fast").option("-s, --stream", "Stream response as NDJSON", false).option("-c, --context <context>", "Additional context").option("--id <queryId>", "Reuse query ID for thread follow-ups").option("--no-summary", "Disable summary generation").option("--mermaid", "Output Mermaid diagram (codemap mode only)", false).action(queryCommand);
program.command("get").description("Retrieve previous query results").argument("<queryId>", "Query ID to retrieve").action(getCommand);
program.command("status").description("Check repo indexing status").argument("<repo>", "owner/repo").action(statusCommand);
program.command("list").description("Search indexed repos").argument("<search>", "Search term").action(listCommand);
program.command("warm").description("Pre-warm repo cache").argument("<repo>", "owner/repo").action(warmCommand);
program.parse();
export {
  codemapToMermaid
};
