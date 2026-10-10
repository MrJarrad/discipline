#!/usr/bin/env node
/* session-resume — one-screen digest per lane for a resuming session (backlog 161,
   decision 2026-10-10-session-start-wrap-efficiency-ask). Replaces ~25 hand-run
   reads (cockpit -> handovers -> progress files -> branch heads -> PRs) with one
   command:  node session-resume.mjs <vault-root> [--repo name=path ...] [--days N]

   Lanes come from the newest `## Next` block of each projects/<p>/<p>-handover.md
   (wrap writes it; format below). Recent progress files no `## Next` block names
   are listed after, as "no Next block". Live state comes from git only
   (`ls-remote`, explicit-refspec fetch: clones are shallow, so a lane branch is
   invisible until fetched by name); `gh` is used for PR state and checks when it
   answers, and a line says what could not be read when it does not. Nothing here
   throws on a network failure, writes to the vault, or reprints the operator queue
   (path + open-row count only).

   Next-block format (one lane per `- lane:` item, ` | `-separated key: value):
     - lane: profile | repo: jhd-portfolio | branch: claude/profile | pr: #299 |
       head: 1a2b3c4 | progress: projects/portfolio/evidence/x/progress.md |
       contract: projects/portfolio/decisions/y.md | owner: reviewer | go: <one line>
   (one physical line each; `repo` and `branch` are the only keys the digest needs.)

   Interface: buildDigest(opts) -> { text, lanes, pluginStale } ; parseNextBlock,
   lastProgressLine, countOpenQueueRows are exported for the tests.            */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export function runCmd(cmd, args, { cwd, timeout = 15000 } = {}) {
  const r = spawnSync(cmd, args, { cwd, timeout, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  if (r.error) return { ok: false, stdout: "", stderr: r.error.code === "ETIMEDOUT" ? `timed out after ${timeout / 1000}s` : String(r.error.message) };
  return { ok: r.status === 0, stdout: r.stdout || "", stderr: (r.stderr || "").trim().split("\n")[0] };
}

/* The first (newest) `## Next` / `### Next` section of a handover -> lane records. */
export function parseNextBlock(text) {
  const lines = String(text).split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{2,3}\s+Next\b/.test(l));
  if (start < 0) return [];
  const level = lines[start].match(/^#+/)[0].length;
  const body = [];
  for (const l of lines.slice(start + 1)) {
    const h = /^(#+)\s/.exec(l);
    if (h && h[1].length <= level) break;
    body.push(l);
  }
  // join indented continuation lines onto their `- lane:` item
  const items = [];
  for (const l of body) {
    if (/^\s*-\s+lane:/.test(l)) items.push(l.replace(/^\s*-\s+/, "").trim());
    else if (items.length && /^\s+\S/.test(l)) items[items.length - 1] += " " + l.trim();
  }
  return items.map((item) => {
    const lane = {};
    for (const part of item.split(/\s+\|\s+/)) {
      const m = /^([a-z]+):\s*(.*)$/i.exec(part.trim());
      if (m) lane[m[1].toLowerCase()] = m[2].trim();
    }
    return lane;
  });
}

export function lastProgressLine(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : "";
}

/* Open queue rows: table rows whose first cell is a number and not struck. */
export function countOpenQueueRows(text) {
  return String(text).split(/\r?\n/).filter((l) => /^\|\s*\d+[a-z]?\s*\|/.test(l) && !/^\|\s*~~/.test(l) && !/^\|\s*\d+[a-z]?\s*\|\s*~~/.test(l)).length;
}

const ago = (secs) => {
  if (!Number.isFinite(secs)) return "unknown age";
  const s = Math.max(0, Math.round(secs));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 172800) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const clip = (s, n = 150) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function walk(dir, name, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, name, out);
    else if (e.name === name) out.push(p);
  }
  return out;
}

function fileTime(vault, file, exec) {
  const g = exec("git", ["-C", vault, "log", "-1", "--format=%ct", "--", relative(vault, file)]);
  const t = g.ok ? parseInt(g.stdout.trim(), 10) : NaN;
  if (Number.isFinite(t)) return t;
  try { return Math.floor(statSync(file).mtimeMs / 1000); } catch { return NaN; }
}

function repoPath(name, repos, home) {
  if (repos[name]) return repos[name];
  const bare = name.replace(/^jhd-/, "");
  for (const p of [`/home/user/${name}`, `/home/user/jhd-${bare}`, `/home/user/${bare}`, join(home, "JHD", name, "main"), join(home, "JHD", bare, "main")]) {
    if (existsSync(join(p, ".git"))) return p;
  }
  return null;
}

function pluginLine({ env, installedPath, pluginRoot }) {
  const readVer = (p) => { try { return JSON.parse(readFileSync(p, "utf8")).version; } catch { return null; } };
  const root = pluginRoot ?? env.CLAUDE_PLUGIN_ROOT ?? resolve(HERE, "..", "..");
  const loaded = readVer(join(root, ".claude-plugin", "plugin.json"));
  let installed = null;
  try {
    const j = JSON.parse(readFileSync(installedPath, "utf8"));
    const entries = j.plugins?.["discipline@discipline"] ?? Object.entries(j.plugins ?? {}).find(([k]) => k.startsWith("discipline@"))?.[1];
    installed = (Array.isArray(entries) ? entries[0] : entries)?.version ?? null;
  } catch { /* unreadable: said below */ }
  if (!loaded || !installed) {
    return { stale: false, line: `plugin: loaded ${loaded ?? "unreadable"}, installed ${installed ?? "unreadable"} (could not compare)` };
  }
  if (loaded !== installed) {
    return { stale: true, line: `!! plugin: this session loaded discipline ${loaded}; ${installed} is installed. The session keeps the OLD cached rules until /reload-plugins or a restart.` };
  }
  return { stale: false, line: `plugin: discipline ${loaded} loaded = installed` };
}

function githubSlug(url) {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/.exec(url.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

function laneState(lane, ctx) {
  const { exec, repos, home, vault, now } = ctx;
  const out = [];
  const flags = [];
  const dir = lane.repo ? repoPath(lane.repo, repos, home) : null;
  const gitArgs = (...a) => (dir ? ["-C", dir, ...a] : null);
  let slug = null;
  let remote = null;
  if (dir) {
    const u = exec("git", gitArgs("remote", "get-url", "origin"));
    if (u.ok) { remote = u.stdout.trim(); slug = githubSlug(remote); }
  }
  if (!remote && lane.repo) { remote = `https://github.com/MrJarrad/${lane.repo}`; slug = `MrJarrad/${lane.repo}`; }

  let branchTime = NaN;
  if (lane.branch && remote) {
    const ls = exec("git", dir ? gitArgs("ls-remote", "origin", `refs/heads/${lane.branch}`) : ["ls-remote", remote, `refs/heads/${lane.branch}`]);
    if (!ls.ok) out.push(`head    not readable: git ls-remote failed (${ls.stderr || "no detail"})`);
    else if (!ls.stdout.trim()) {
      out.push(`head    branch ${lane.branch} is not on origin (merged and deleted, or never pushed)`);
      flags.push("branch absent on origin");
    } else {
      const sha = ls.stdout.split(/\s+/)[0];
      let detail = "";
      if (dir) {
        const f = exec("git", gitArgs("fetch", "--depth=1", "-q", "origin", `+refs/heads/${lane.branch}:refs/remotes/origin/${lane.branch}`), { timeout: 30000 });
        if (f.ok) {
          const l = exec("git", gitArgs("log", "-1", "--format=%ct%x09%s", `refs/remotes/origin/${lane.branch}`));
          const [ct, subj] = l.stdout.trim().split("\t");
          branchTime = parseInt(ct, 10);
          detail = ` — ${ago(now - branchTime)}: ${clip(subj ?? "", 90)}`;
        } else detail = ` — commit detail not fetched (${f.stderr || "fetch failed"})`;
      } else detail = " — repo not cloned here, sha only";
      out.push(`head    ${sha.slice(0, 7)} on ${lane.branch}${detail}`);
      if (lane.head && !sha.startsWith(lane.head.slice(0, 7))) flags.push(`branch moved since wrap (handover ${lane.head.slice(0, 7)}, live ${sha.slice(0, 7)})`);
    }
  } else if (!lane.branch) out.push("head    no branch recorded in the Next block");

  // PR state: gh when it answers, else the pull ref from git.
  const prNum = (lane.pr || "").replace(/[^\d]/g, "");
  const prArg = prNum || lane.branch;
  let prLine = null;
  if (slug && prArg) {
    const g = exec("gh", ["pr", "view", prArg, "--repo", slug, "--json", "number,state,isDraft,mergeable,statusCheckRollup,headRefOid"], { timeout: 20000 });
    if (g.ok) {
      try {
        const j = JSON.parse(g.stdout);
        const checks = j.statusCheckRollup ?? [];
        const bad = checks.filter((c) => /FAIL|ERROR|TIMED|CANCEL/.test(c.conclusion || c.state || "")).length;
        const pend = checks.filter((c) => !(c.conclusion || c.state) || /PEND|PROGRESS|QUEUED|EXPECTED/.test(c.status || c.state || "")).length;
        prLine = `PR      #${j.number} ${j.state.toLowerCase()}${j.isDraft ? " (draft)" : ""}, mergeable ${String(j.mergeable).toLowerCase()}, checks ${checks.length ? `${checks.length - bad - pend} ok / ${bad} failing / ${pend} pending` : "none reported (gate-run tail is on the PR as a comment)"}`;
      } catch { prLine = "PR      gh answered but the reply was not JSON"; }
    } else prLine = `PR      state/CI not readable (gh: ${g.stderr || "no detail"})`;
  }
  if (!prLine && prNum && remote) {
    const r = exec("git", dir ? gitArgs("ls-remote", "origin", `refs/pull/${prNum}/head`) : ["ls-remote", remote, `refs/pull/${prNum}/head`]);
    prLine = r.ok && r.stdout.trim() ? `PR      #${prNum} head ${r.stdout.split(/\s+/)[0].slice(0, 7)} (state/CI not readable without the GitHub API)` : `PR      #${prNum}: no pull ref found via git`;
  }
  if (prLine) out.push(prLine);
  else if (!prNum) out.push("PR      none recorded");

  // Progress vs branch reality.
  if (lane.progress) {
    const p = resolve(vault, lane.progress);
    if (!existsSync(p)) out.push(`prog    ${lane.progress} does not exist`);
    else {
      const line = lastProgressLine(readFileSync(p, "utf8"));
      const t = fileTime(vault, p, exec);
      out.push(`prog    "${clip(line, 110)}" (${ago(now - t)})`);
      if (Number.isFinite(branchTime) && Number.isFinite(t) && branchTime > t + 60) flags.push("progress file is older than the branch head: it is stale, trust the branch");
    }
  } else out.push("prog    no progress file recorded");
  for (const f of flags) out.push(`!!      ${f}`);
  return out;
}

export function buildDigest(opts = {}) {
  const vault = resolve(opts.vault);
  const exec = opts.exec ?? runCmd;
  const home = opts.home ?? process.env.HOME ?? "/root";
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const days = opts.days ?? 3;
  const ctx = { exec, repos: opts.repos ?? {}, home, vault, now };
  const text = [];
  const plugin = pluginLine({ env: opts.env ?? process.env, installedPath: opts.installedPath ?? join(home, ".claude", "plugins", "installed_plugins.json"), pluginRoot: opts.pluginRoot });
  text.push(`SESSION RESUME  ${new Date(now * 1000).toISOString().slice(0, 16)}Z  vault ${vault}`);
  text.push(plugin.line);

  const v = exec("git", ["-C", vault, "rev-parse", "--short", "HEAD"]);
  const sync = exec("git", ["-C", vault, "ls-remote", "origin", "refs/heads/main"]);
  if (sync.ok && sync.stdout.trim() && v.ok) {
    const main = sync.stdout.split(/\s+/)[0];
    text.push(`vault: HEAD ${v.stdout.trim()}, origin/main ${main.slice(0, 7)} — run \`git fetch origin main\` and read the cockpit and handover from origin/main (routing § Resume vs fresh)`);
  } else text.push("vault: origin/main not readable from here (git ls-remote failed); read cockpit and handovers from origin/main once it is");

  const queue = join(vault, "orchestrator", "operator-queue.md");
  text.push(existsSync(queue)
    ? `queue: ${countOpenQueueRows(readFileSync(queue, "utf8"))} open rows in orchestrator/operator-queue.md (path and count only; the cockpit wrap block holds the rows)`
    : "queue: orchestrator/operator-queue.md not found");
  text.push("");

  const lanes = [];
  const seenProgress = new Set();
  let handovers = [];
  try {
    handovers = readdirSync(join(vault, "projects"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(vault, "projects", e.name, `${e.name}-handover.md`)).filter(existsSync);
  } catch { /* no projects dir */ }
  for (const h of handovers) {
    for (const lane of parseNextBlock(readFileSync(h, "utf8"))) {
      lanes.push({ ...lane, handover: relative(vault, h) });
      if (lane.progress) seenProgress.add(resolve(vault, lane.progress));
    }
  }
  if (!lanes.length) text.push("No `## Next` blocks in any handover (wrap writes them from 1.128.0). Falling back to recent progress files only.");
  for (const lane of lanes) {
    text.push(`LANE ${lane.lane ?? "(unnamed)"}  [${lane.repo ?? "no repo"} @ ${lane.branch ?? "no branch"}]  from ${lane.handover}`);
    for (const l of laneState(lane, ctx)) text.push(`  ${l}`);
    text.push(`  contract ${lane.contract ?? "none recorded"}   next owner ${lane.owner ?? "none recorded"}`);
    if (lane.go) text.push(`  go      ${clip(lane.go, 200)}`);
    text.push("");
  }

  const loose = walk(join(vault, "projects"), "progress.md")
    .filter((p) => !seenProgress.has(p))
    .map((p) => ({ p, t: fileTime(vault, p, exec), line: lastProgressLine(readFileSync(p, "utf8")) }))
    .filter((x) => Number.isFinite(x.t) && now - x.t < days * 86400 && (!/\b(done|merged|landed|wrapped)\b/i.test(x.line) || /in progress|waiting|running/i.test(x.line)))
    .sort((a, b) => b.t - a.t).slice(0, 8);
  if (loose.length) {
    text.push(`No Next block (progress files touched in the last ${days} days, last line not done):`);
    for (const x of loose) text.push(`  ${relative(vault, x.p)} — "${clip(x.line, 100)}" (${ago(now - x.t)})`);
  }
  return { text: text.join("\n").replace(/\n+$/, "\n"), lanes, pluginStale: plugin.stale };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const repos = {};
  let days;
  let vault;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--repo") { const [k, ...v] = (args[++i] ?? "").split("="); repos[k] = v.join("="); }
    else if (args[i] === "--days") days = Number(args[++i]);
    else vault = args[i];
  }
  if (!vault || !existsSync(vault)) {
    console.error("usage: node session-resume.mjs <vault-root> [--repo name=path ...] [--days N]");
    process.exit(2);
  }
  process.stdout.write(buildDigest({ vault, repos, days }).text);
}
