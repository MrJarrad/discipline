#!/usr/bin/env node
/* card-gate — DISC-367 slice 2 (operator 24 Nov: "make it our process iron-clad"). A change to a module that
   jhd-portfolio's docs/site/inventory.md maps to a feature must carry that feature's card
   (docs/site/cards/<feature>.md) in the same diff; the cards are how an agent knows how a feature behaves.
   There are no GitHub Actions on private repos, so the check runs three ways: this CLI (an Engineer before
   handoff, a reviewer), and hooks/bin/card-gate-merge.mjs at the merge call.

     node card-gate.mjs --repo <clone> --base <ref> --head <ref>     a local branch
     node card-gate.mjs --repo <clone> --pr <n> [--head <sha>]       a PR, from GitHub's merge ref

   Prints {"cardGate":{ok,files,missing,unmapped,exempt,notice,reason}}; exit 0 pass, 1 fail, 2 usage.
   The index is read from the head's own inventory.md, so a PR that adds a module also adds its row.
   A head with no inventory.md passes with a notice (the gate is inactive until the cards land); a head that
   deletes the base's inventory.md fails (restore it).
   Scope: src/components and src/lib, tests excluded. `shared` modules need no card (no behaviour of their own).
   A card counts when it is in the diff; whether it says the right thing is the reviewer's read.
   Escape: a commit message in the range carrying `Card: no change — <reason>` (reason required, echoed).   */
import { spawnSync } from "node:child_process";
import { prFiles } from "./vault-pr-files.mjs";

const MODULE_DIR = /^src\/(?:components|lib)\//;
const CODE = /\.(?:tsx?|jsx?|mjs|css)$/;
const TEST = /(?:\.(?:test|spec)\.[a-z]+$|(?:^|\/)__tests__\/)/;
const SHARED = "shared";
export const EXEMPT = /^Card:\s*no change\s*[—–-]+\s*(\S.*)$/im;

/* `### \`feature\` (n)` headings, each followed by table rows whose first cell is a backticked module under src/. */
export function parseModuleIndex(md) {
  const map = new Map();
  let feature = null;
  for (const line of String(md).split("\n")) {
    const h = /^###\s+`([^`]+)`/.exec(line);
    if (h) { feature = h[1]; continue; }
    if (/^##\s/.test(line)) { feature = null; continue; }
    const m = feature && /^\|\s*`([^`]+)`\s*\|/.exec(line);
    if (m) map.set(`src/${m[1]}`, feature);
  }
  return map;
}

export function cardGate({ files, index, exempt, deleted = [] }) {
  const changed = files.filter((f) => MODULE_DIR.test(f) && CODE.test(f) && !TEST.test(f));
  const byFeature = new Map();
  const unmapped = [];
  for (const f of changed) {
    const feature = index.get(f);
    if (!feature) { if (!deleted.includes(f)) unmapped.push(f); continue; }
    if (feature === SHARED) continue;
    byFeature.set(feature, [...(byFeature.get(feature) || []), f]);
  }
  const missing = [...byFeature].map(([feature, modules]) => ({ feature, card: `docs/site/cards/${feature}.md`, modules }))
    .filter((m) => !files.includes(m.card));
  const why = String(exempt ?? "").trim();
  const clean = !missing.length && !unmapped.length;
  return { ok: clean || (!!why && !unmapped.length), files: changed, missing, unmapped, ...(why && !clean ? { exempt: why } : {}) };
}

const git = (repo, ...a) => {
  const r = spawnSync("git", ["-C", repo, ...a], { encoding: "utf8", timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || r.error?.message || "").trim().split("\n")[0] };
};

/* Run the gate over base..head of a clone: files, deleted files, the exemption in any commit message, the head's index. */
export function branchCheck({ repo, base, head }) {
  const fail = (reason) => ({ ok: false, files: [], missing: [], unmapped: [], reason });
  // The exemption is read first; with no card map yet (before the cards land) the gate is inactive, never a lock-out.
  const log = git(repo, "log", "--format=%B", `${base}..${head}`);
  const exempt = EXEMPT.exec(log.out || "")?.[1];
  const tree = git(repo, "ls-tree", "--name-only", head, "docs/site/inventory.md");
  if (!tree.ok) return fail(`cannot read ${head}: ${tree.err}`);
  if (!tree.out) {
    // A deletion is not an inactive gate: the base had the map, the head dropped it.
    const was = git(repo, "ls-tree", "--name-only", base, "docs/site/inventory.md");
    if (was.ok && was.out && !exempt) return fail("this change deletes docs/site/inventory.md, the card map the gate reads: restore it (or add a commit with `Card: no change — <reason>`)");
  }
  if (!tree.out) return { ok: true, files: [], missing: [], unmapped: [], notice: "card gate inactive: no docs/site/inventory.md", ...(exempt ? { exempt } : {}) };
  const inv = git(repo, "show", `${head}:docs/site/inventory.md`);
  if (!inv.ok) return fail(`cannot read docs/site/inventory.md at ${head} (${inv.err})`);
  const d = git(repo, "diff", "--name-status", "--no-renames", `${base}...${head}`);
  if (!d.ok) return fail(`diff failed: ${d.err}`);
  const rows = d.out ? d.out.split("\n").map((l) => l.split("\t")) : [];
  return cardGate({ files: rows.map((r) => r[1]), deleted: rows.filter((r) => r[0] === "D").map((r) => r[1]), index: parseModuleIndex(inv.out), exempt });
}

/* The same over a PR: GitHub's merge ref (vault-pr-files' fetch), base = its first parent. Incomplete -> fails closed. */
export function prCheck({ repo, pr, head }) {
  const f = prFiles({ vault: repo, pr, head });
  if (!f.complete) return { ok: false, files: [], missing: [], unmapped: [], reason: `PR files unreadable: ${f.reason}`, head: f.head, origin: f.origin };
  const ref = `refs/vault-pr-files/${pr}/merge`;
  const base = git(repo, "rev-parse", `${ref}^1`);
  if (!base.ok) return { ok: false, files: [], missing: [], unmapped: [], reason: `no merge base: ${base.err}` };
  return { ...branchCheck({ repo, base: base.out, head: f.head }), head: f.head, origin: f.origin };
}

if (process.argv[1] && process.argv[1].endsWith("card-gate.mjs")) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const repo = arg("--repo"), pr = Number(arg("--pr"));
  const byPr = Number.isInteger(pr) && pr > 0;
  if (!repo || (!byPr && !(arg("--base") && arg("--head")))) {
    console.error("usage: node card-gate.mjs --repo <clone> (--base <ref> --head <ref> | --pr <n> [--head <sha>])");
    process.exit(2);
  }
  const v = byPr ? prCheck({ repo, pr, head: arg("--head") }) : branchCheck({ repo, base: arg("--base"), head: arg("--head") });
  console.log(JSON.stringify({ cardGate: v }));
  process.exit(v.ok ? 0 : 1);
}
