#!/usr/bin/env node
import { createReadStream, existsSync, readFileSync, statSync, watch } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dashboardDir = resolve(repoRoot, "scripts/dashboard");
const registryPath = resolve(repoRoot, "tasks/registry.yaml");
const overlayPaths = [
  resolve(repoRoot, "tasks/2026-08-audit-overlay.yaml"),
  resolve(repoRoot, "tasks/2026-08-red-team-findings.yaml"),
  resolve(repoRoot, "tasks/2026-08-red-team-overrides.yaml"),
  resolve(repoRoot, "tasks/2026-08-red-team-pyrus-runtime.yaml"),
  resolve(repoRoot, "tasks/2026-08-red-team-round2-findings.yaml"),
  resolve(repoRoot, "tasks/2026-08-red-team-round2-overrides.yaml"),
  resolve(repoRoot, "tasks/2026-08-red-team-round2-security.yaml"),
];
const PORT = Number(process.env.DASHBOARD_PORT || 4748);

const MIME = { ".html": "text/html; charset=utf-8", ".woff2": "font/woff2", ".json": "application/json; charset=utf-8" };
function readYaml(path) { return load(readFileSync(path, "utf8")) || {}; }

function applyOverlay(base, overlay, sourceName) {
  const result = JSON.parse(JSON.stringify(base));
  result.meta = { ...(result.meta || {}), overlays: [...new Set([...(result.meta?.overlays || []), sourceName])], state_model: "historical-registry + audit-overlays" };
  result.phases = Array.isArray(result.phases) ? result.phases : [];
  result.tasks = Array.isArray(result.tasks) ? result.tasks : [];
  const phaseById = new Map(result.phases.map(p => [String(p.id), p]));
  for (const phase of (overlay.phase_overrides || [])) {
    const existing = phaseById.get(String(phase.id));
    if (existing) Object.assign(existing, phase);
    else { const created = { id: phase.id, name: phase.name, exit: phase.exit }; result.phases.push(created); phaseById.set(String(phase.id), created); }
  }
  const taskById = new Map(result.tasks.map(t => [t.id, t]));
  for (const override of (overlay.task_overrides || [])) {
    const existing = taskById.get(override.id);
    if (existing) { Object.assign(existing, override); existing._overridden_by_audit = true; }
    else { const created = { ...override }; result.tasks.push(created); taskById.set(created.id, created); }
  }
  for (const task of (overlay.new_tasks || [])) {
    const existing = taskById.get(task.id);
    if (existing) Object.assign(existing, task);
    else { const created = { ...task }; result.tasks.push(created); taskById.set(created.id, created); }
  }
  result.version = `${base.version || "unknown"}+qa-overlays`;
  return result;
}

function readRegistryAsJSON() {
  let result = readYaml(registryPath);
  for (const overlayPath of overlayPaths) if (existsSync(overlayPath)) result = applyOverlay(result, readYaml(overlayPath), overlayPath);
  return JSON.stringify(result);
}

const sseClients = new Set();
let debounceTimer = null;
function broadcastChange() {
  const payload = `event: registry-changed\ndata: ${Date.now()}\n\n`;
  for (const res of sseClients) { try { res.write(payload); } catch { sseClients.delete(res); } }
}
function onRegistryFileEvent() { clearTimeout(debounceTimer); debounceTimer = setTimeout(broadcastChange, 150); }

function serveStatic(req, res, filePath) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Not found"); return; }
  const ext = extname(filePath); res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" }); createReadStream(filePath).pipe(res);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/api/registry.json") {
    try { const json = readRegistryAsJSON(); res.writeHead(200, { "Content-Type": MIME[".json"], "Cache-Control": "no-store" }); res.end(json); }
    catch (err) { res.writeHead(500, { "Content-Type": "text/plain" }); res.end(`Failed to read roadmap data: ${err instanceof Error ? err.message : String(err)}`); }
    return;
  }
  if (url.pathname === "/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(": connected\n\n"); sseClients.add(res); req.on("close", () => sseClients.delete(res)); return;
  }
  if (url.pathname === "/healthz") { res.writeHead(200, { "Content-Type": "text/plain" }); res.end("ok"); return; }
  const fsPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const resolved = resolve(dashboardDir, `.${fsPath}`);
  if (!resolved.startsWith(dashboardDir)) { res.writeHead(403, { "Content-Type": "text/plain" }); res.end("Forbidden"); return; }
  serveStatic(req, res, resolved);
});

watch(registryPath, { persistent: true }, onRegistryFileEvent);
for (const overlayPath of overlayPaths) if (existsSync(overlayPath)) watch(overlayPath, { persistent: true }, onRegistryFileEvent);

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Dashboard: http://localhost:${PORT}/`);
  console.log(`Watching: ${registryPath}`);
  for (const overlayPath of overlayPaths) console.log(`Overlay: ${overlayPath}`);
});
