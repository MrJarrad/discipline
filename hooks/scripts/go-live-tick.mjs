#!/usr/bin/env node
/* go-live-tick — DISC-310 (parent s82: "tick go-live on merge"). When a row that is a line of a project's go-live file (`projects/<p>/<p>-go-live.md`,
   `- [ ] PF-1445 · title`) merges, this prints the line to tick and the "Launch: N of M done" line the Status doc then shows; --apply writes the tick
   into the file (a vault branch change, reviewed like any vault note). The doc itself follows by re-running status-layout.mjs, which prints the
   setLaunchLine / setUpNext ops. Group 5 (after launch) lines tick but never change the count.
   Usage: node go-live-tick.mjs --vault <root> --rows PF-1445[,PF-1446] [--apply]  -> JSON { ticked, already, notFound, launch, file, noGoLive } */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { resolveVaultRoot } from "./lib/vault-root.mjs";
import { neededFromYou, vaultBlobBase } from "./needed-from-you.mjs";
import { parseGoLive } from "./status-layout.mjs";

export function tickGoLive(text, ids, { base = null, file = "" } = {}) {
  const ticked = [], already = [], notFound = [];
  let out = String(text);
  for (const id of ids) {
    const re = new RegExp(`^- \\[( |x)\\] ${id.replace(/[-]/g, "\\-")} · .*$`, "im");
    const m = re.exec(out);
    if (!m) { notFound.push(id); continue; }
    if (m[1].toLowerCase() === "x") { already.push(id); continue; }
    const to = m[0].replace("- [ ]", "- [x]");
    out = out.slice(0, m.index) + to + out.slice(m.index + m[0].length);
    ticked.push({ id, from: m[0], to });
  }
  const gl = parseGoLive(out);
  return { text: out, ticked, already, notFound, launch: `Launch: ${gl.done} of ${gl.total} done · ${base ? `[Full go-live list](${base}/${file})` : "full list in the vault"}` };
}

function main() {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i !== -1 ? a[i + 1] : undefined; };
  if (!get("--vault") || !get("--rows")) { console.error("usage: go-live-tick --vault <root> --rows PF-1445[,…] [--apply]"); process.exit(1); }
  const vault = resolveVaultRoot(get("--vault")), base = vaultBlobBase(vault);
  const byPrefix = new Map();
  for (const id of get("--rows").split(",").map((x) => x.trim()).filter(Boolean)) { const px = /^([A-Z]{2,4})-/.exec(id)?.[1]; if (!px) { console.error(`go-live-tick: ${id} is not a project-prefixed row id`); process.exit(1); } byPrefix.set(px, [...(byPrefix.get(px) || []), id]); }
  const result = { ticked: [], already: [], notFound: [], launch: [], files: [], noGoLive: [] };
  for (const [px, ids] of byPrefix) {
    const nf = neededFromYou(vault, [px]);
    const dir = nf.ok && nf.projects[0].backlog.file ? dirname(nf.projects[0].backlog.file) : null;
    const file = dir && `${dir}/${basename(dir)}-go-live.md`;
    if (!file || !existsSync(join(vault, file))) { result.noGoLive.push(px); continue; }
    const r = tickGoLive(readFileSync(join(vault, file), "utf8"), ids, { base, file });
    result.ticked.push(...r.ticked); result.already.push(...r.already); result.notFound.push(...r.notFound); result.launch.push(r.launch); result.files.push(file);
    if (a.includes("--apply") && r.ticked.length) writeFileSync(join(vault, file), r.text);
  }
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1]?.endsWith("go-live-tick.mjs")) main();
