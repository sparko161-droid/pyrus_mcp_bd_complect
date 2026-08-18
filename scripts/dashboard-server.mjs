#!/usr/bin/env node
// Persistent local dashboard server for tasks/registry.yaml.
//
// `pnpm run dashboard` (or `node scripts/dashboard-server.mjs`) serves
// scripts/dashboard/index.html on a fixed local port, with the registry
// data fetched live from tasks/registry.yaml on every request (never
// baked into the HTML, unlike the one-off Artifact snapshot) and pushed to
// the browser over Server-Sent Events the moment the file changes -- so
// running any `task-registry` command that mutates the registry updates
// the open dashboard tab within a second, no manual refresh.
//
// Deliberately plain `node:http` + `fs.watch`, no framework and no new
// runtime dependency beyond `js-yaml` (already a root devDependency) --
// this is a single-user local tool, not a service.

import { createReadStream, existsSync, readFileSync, statSync, watch } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dashboardDir = resolve(repoRoot, "scripts/dashboard");
const registryPath = resolve(repoRoot, "tasks/registry.yaml");
const PORT = Number(process.env.DASHBOARD_PORT || 4748);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
};

function readRegistryAsJSON() {
  const doc = load(readFileSync(registryPath, "utf8"));
  return JSON.stringify(doc);
}

// SSE clients currently connected. A Set, not a single value, because
// several browser tabs (or the same tab across reloads) can be open at once.
const sseClients = new Set();

function broadcastChange() {
  const payload = `event: registry-changed\ndata: ${Date.now()}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

// fs.watch fires more than once per logical save on some platforms
// (editors, and task-registry's own write-then-rename-free plain
// writeFileSync can still trigger duplicate "change" events). Debounce so
// one `task-registry claim` command doesn't fire the SSE event three times.
let debounceTimer = null;
function onRegistryFileEvent() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(broadcastChange, 150);
}

function serveStatic(req, res, filePath) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }
  const ext = extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/registry.json") {
    try {
      const json = readRegistryAsJSON();
      res.writeHead(200, { "Content-Type": MIME[".json"], "Cache-Control": "no-store" });
      res.end(json);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`Failed to read tasks/registry.yaml: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  if (url.pathname === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(": connected\n\n");
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }

  if (url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  const fsPath = url.pathname === "/" ? "/index.html" : url.pathname;
  // Prevent path traversal outside scripts/dashboard/ -- this is a local
  // tool, but it still binds a real TCP port, so don't hand out arbitrary
  // filesystem reads.
  const resolved = resolve(dashboardDir, `.${fsPath}`);
  if (!resolved.startsWith(dashboardDir)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }
  serveStatic(req, res, resolved);
});

watch(registryPath, { persistent: true }, onRegistryFileEvent);

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Dashboard: http://localhost:${PORT}/`);
  console.log(`Watching: ${registryPath}`);
});
