#!/usr/bin/env node
/* SessionStart + Stop — s79 (operator, doc comment 2026-11-12: "do we have a similar mechanic for using the need from you
   doc vs inline? it's not been what the last couple of session automatically did"). The cloud container loaded plugin
   1.181.0 while main was 1.198.0, so every newer rule and hook was missing and nothing said so. This makes staleness loud
   and blocking instead of a line the parent may skip:
     start  compares the loaded plugin version with the newest release and, when older, writes ~/.claude/plugin-stale.json
            and prints a warning (additionalContext) with the exact update commands; current -> removes the marker.
     stop   blocks a status reply (a `## Needed from you` heading or the `Full list:` line) once while the loaded version
            is still older than the recorded release; an update + reload clears it.
   The newest release comes from DISCIPLINE_LATEST_VERSION, else a 4 s fetch of the repo's plugin.json
   (DISCIPLINE_LATEST_URL overrides), else the marketplace clone on disk: the clone can be as stale as the cache (the s79
   case), so it is only the offline fallback. Unreadable -> silent, nothing claimed.
   SELF-CONTAINED (node built-ins only): a stale cache loads none of this plugin's hooks, so the vault's own
   .claude/settings.json runs a copy of this file for SessionStart and Stop. Any error -> silent exit 0.            */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MARKER = () => join(homedir(), ".claude", "plugin-stale.json");
const DEFAULT_URL = "https://raw.githubusercontent.com/MrJarrad/discipline/main/.claude-plugin/plugin.json";
const STATUS = /^##\s+Needed from you\b|^Full list:/m;
const FIX = "claude plugin update discipline@discipline (or /plugin update discipline), then /reload-plugins or restart the session";

const readVersion = (p) => { try { return JSON.parse(readFileSync(p, "utf8")).version || null; } catch { return null; } };
const loadedVersion = () => readVersion(join(process.env.CLAUDE_PLUGIN_ROOT || resolve(HERE, "..", ".."), ".claude-plugin", "plugin.json"));
const older = (a, b) => { const [x, y] = [a, b].map((v) => String(v).split(".").map(Number)); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); return false; };

async function latestVersion() {
  if (process.env.DISCIPLINE_LATEST_VERSION) return process.env.DISCIPLINE_LATEST_VERSION;
  try {
    const r = await fetch(process.env.DISCIPLINE_LATEST_URL || DEFAULT_URL, { signal: AbortSignal.timeout(4000) });
    const v = r.ok ? (await r.json()).version || null : null;
    if (v) return v;
  } catch { /* offline: the clone below */ }
  return readVersion(join(homedir(), ".claude", "plugins", "marketplaces", "discipline", ".claude-plugin", "plugin.json"));
}

const message = (loaded, latest) => `PLUGIN STALE: discipline ${loaded} is loaded but ${latest} is released, so rules and hooks added since ${loaded} (the pinned-checklist status rules among them) are not running in this session. Run: ${FIX}.`;

async function start() {
  const loaded = loadedVersion(), latest = await latestVersion();
  if (!loaded || !latest) return;
  if (!older(loaded, latest)) { try { rmSync(MARKER(), { force: true }); } catch {} return; }
  mkdirSync(dirname(MARKER()), { recursive: true });
  writeFileSync(MARKER(), JSON.stringify({ loaded, latest }));
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: message(loaded, latest) } }));
}

function stop() {
  let input; try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  if (input.stop_hook_active || !input.transcript_path || !existsSync(MARKER())) return;
  let m; try { m = JSON.parse(readFileSync(MARKER(), "utf8")); } catch { return; }
  const loaded = loadedVersion();
  if (!loaded || !m.latest || !older(loaded, m.latest)) return;
  let final = null;
  for (const line of readFileSync(input.transcript_path, "utf8").split("\n")) {
    if (!line) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    const c = e.message?.content;
    if (e.type === "user" && !(Array.isArray(c) && c.some((b) => b?.type === "tool_result"))) final = null;
    else if (e.type === "assistant") { const t = typeof c === "string" ? c : (Array.isArray(c) ? c : []).filter((b) => b?.type === "text").map((b) => b.text).join("\n"); if (t.trim()) final = t; }
  }
  if (final && STATUS.test(final)) process.stdout.write(JSON.stringify({ decision: "block", reason: `Stop check: ${message(loaded, m.latest)} Name the gap in this status reply as a queue row, not a note.` }));
}

if (process.argv[1]?.endsWith("plugin-freshness.mjs")) {
  try { process.argv[2] === "stop" ? stop() : await start(); } catch { /* silent */ }
}
