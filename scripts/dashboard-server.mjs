#!/usr/bin/env node
// Persistent local dashboard server for tasks/registry.yaml.
//
// The dashboard keeps the historical registry intact, then overlays the
// executable 2026 audit correction layer from
// tasks/2026-08-audit-overlay.yaml. This makes the dashboard an honest
// execution view while preserving the original task history.
//
// `pnpm run dashboard` (or `node scripts/dashboard-server.mjs`) serves
// scripts/dashboard/index.html and pushes updates over Server-Sent Events.

import { createReadStream, existsSync, readFileSync, statSync, watch } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dashboardDir = resolve(repoRoot, "scripts/dashboard");
const registryPath = resolve(repoRoot, "tasks/registry.yaml");
const overlayPath = resolve(repoRoot, "tasks/2026-08-audit-overlay.yaml");
const PORT = Number(process.env.DASHBOARD_PORT || 4748);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
};

function readYaml(path) {
  return load(readFileSync(path, "utf8")) || {};
}

function applyAuditOverlay(base, overlay) {
  const result = JSON.parse(JSON.stringify(base));
  result.meta = {
    ...(result.meta || {}),
    audit_overlay: "tasks/2026-08-audit-overlay.yaml",
    audit_baseline_date: "2026-08-19",
    state_model: "historical-registry + executable-audit-overlay",
  };

  result.phases = Array.isArray(result.phases) ? result.phases : [];
  result.tasks = Array.isArray(result.tasks) ? result.tasks : [];

  const phaseById = new Map(result.phases.map(p => [String(p.id), p]));
  for (const phase of (overlay.phase_overrides || [])) {
    const existing = phaseById.get(String(phase.id));
    if (existing) Object.assign(existing, phase);
    else {
      result.phases.push({ id: phase.id, name: phase.name, exit: phase.exit });
      phaseById.set(String(phase.id), result.phases[result.phases.length - 1]);
    }
  }

  const taskById = new Map(result.tasks.map(t => [t.id, t]));
  for (const override of (overlay.task_overrides || [])) {
    const existing = taskById.get(override.id);
    if (existing) {
        Object.assign(existing, override);
        existing._overridden_by_audit = true;
    }
    else result.tasks.push(override);
  }
  for (const task of (overlay.new_tasks || [])) {
    const existing = taskById.get(task.id);
    if (existing) Object.assign(existing, task);
    else {
      result.tasks.push(task);
      taskById.set(task.id, task);
    }
  }

  result.version = `${base.version || "unknown"}+audit-2026-08`;
  return result;
}

function readRegistryAsJSON() {
  const base = readYaml(registryPath);
  const overlay = existsSync(overlayPath) ? readYaml(overlayPath) : {};
  return JSON.stringify(applyAuditOverlay(base, overlay));
}

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
      res.end(`Failed to read roadmap data: ${err instanceof Error ? err.message : String(err)}`);
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
  const resolved = resolve(dashboardDir, `.${fsPath}`);
  if (!resolved.startsWith(dashboardDir)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }
  serveStatic(req, res, resolved);
});

watch(registryPath, { persistent: true }, onRegistryFileEvent);
if (existsSync(overlayPath)) watch(overlayPath, { persistent: true }, onRegistryFileEvent);

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Dashboard: http://localhost:${PORT}/`);
  console.log(`Watching: ${registryPath}`);
  console.log(`Overlay:  ${overlayPath}`);
});
