// DISC-367 slice 2: a behaviour change in a mapped module needs its feature card in the same PR.
// Seams: cardGate (pure), the CLI over a real git repo (--base/--head), no network.
// Run: node --test hooks/scripts/card-gate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cardGate, parseModuleIndex } from "./card-gate.mjs";

const cli = join(dirname(fileURLToPath(import.meta.url)), "card-gate.mjs");
const INVENTORY = [
  "## Module index", "",
  "### `time-circuits` (2)", "", "| Module | Imported by (modules) |", "| --- | --- |",
  "| `components/time-circuits.tsx` | 2 |", "| `lib/time-circuits-state.ts` | 1 |", "",
  "### `hoverboard` (1)", "", "| Module | Imported by (modules) |", "| --- | --- |",
  "| `components/hoverboard.tsx` | 1 |", "",
  "### `shared` (1)", "", "| Module | Imported by (modules) |", "| --- | --- |",
  "| `lib/cn.ts` | 40 |", "",
].join("\n");
const index = parseModuleIndex(INVENTORY);
const verdict = (files, exempt) => cardGate({ files, index, exempt });

test("the module index maps each module path under src/ to its feature", () => {
  assert.equal(index.get("src/components/time-circuits.tsx"), "time-circuits");
  assert.equal(index.get("src/lib/cn.ts"), "shared");
  assert.equal(index.size, 4);
});

test("a mapped module changed with no card is a miss naming the module and the card path", () => {
  const v = verdict(["src/components/time-circuits.tsx"]);
  assert.equal(v.ok, false);
  assert.deepEqual(v.missing, [{ feature: "time-circuits", card: "docs/site/cards/time-circuits.md", modules: ["src/components/time-circuits.tsx"] }]);
});

test("the same change with its card in the diff passes", () => {
  assert.equal(verdict(["src/components/time-circuits.tsx", "docs/site/cards/time-circuits.md"]).ok, true);
});

test("a card for another feature does not cover the change", () => {
  assert.equal(verdict(["src/lib/time-circuits-state.ts", "docs/site/cards/hoverboard.md"]).ok, false);
});

test("two features changed need both cards; each miss is listed", () => {
  const v = verdict(["src/components/time-circuits.tsx", "src/components/hoverboard.tsx", "docs/site/cards/hoverboard.md"]);
  assert.deepEqual(v.missing.map((m) => m.feature), ["time-circuits"]);
});

test("a docs-only, test-only or non-module change passes", () => {
  assert.equal(verdict(["README.md", "docs/site/inventory.md", "src/components/time-circuits.test.tsx", "src/app/page.tsx"]).ok, true);
});

test("a shared module change needs no card (it carries no behaviour of its own)", () => {
  assert.equal(verdict(["src/lib/cn.ts"]).ok, true);
});

test("a new module the index does not map is its own failure, not a pass", () => {
  const v = verdict(["src/components/brand-new.tsx"]);
  assert.equal(v.ok, false);
  assert.deepEqual(v.unmapped, ["src/components/brand-new.tsx"]);
});

test("a new module passes when the same diff adds it to inventory.md and the card", () => {
  const next = parseModuleIndex(INVENTORY.replace("| `lib/cn.ts` | 40 |", "| `lib/cn.ts` | 40 |\n\n### `brand-new` (1)\n\n| Module | Imported by |\n| --- | --- |\n| `components/brand-new.tsx` | 0 |"));
  const v = cardGate({ files: ["src/components/brand-new.tsx", "docs/site/inventory.md", "docs/site/cards/brand-new.md"], index: next });
  assert.equal(v.ok, true);
});

test("`Card: no change — <reason>` passes with the reason echoed for the reviewer; an empty reason does not", () => {
  const v = verdict(["src/components/time-circuits.tsx"], "rename of a local variable");
  assert.equal(v.ok, true);
  assert.equal(v.exempt, "rename of a local variable");
  assert.equal(verdict(["src/components/time-circuits.tsx"], "  ").ok, false);
});

// CLI over a real repo: the diff comes from git, the index from the head's docs/site/inventory.md.
const sh = (cwd, ...a) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { encoding: "utf8" }).trim();
const repo = () => {
  const d = mkdtempSync(join(tmpdir(), "cardgate-"));
  sh(d, "init", "-q", "-b", "main");
  mkdirSync(join(d, "docs/site/cards"), { recursive: true }); mkdirSync(join(d, "src/components"), { recursive: true });
  writeFileSync(join(d, "docs/site/inventory.md"), INVENTORY);
  writeFileSync(join(d, "docs/site/cards/time-circuits.md"), "card\n");
  writeFileSync(join(d, "src/components/time-circuits.tsx"), "a\n");
  sh(d, "add", "-A"); sh(d, "commit", "-qm", "base");
  return d;
};
const run = (d) => { const r = spawnSync(process.execPath, [cli, "--repo", d, "--base", "main", "--head", "HEAD"], { encoding: "utf8" }); return { code: r.status, out: JSON.parse(r.stdout) }; };

test("CLI: a code change without its card exits 1 with a JSON verdict", () => {
  const d = repo(); sh(d, "checkout", "-qb", "work");
  writeFileSync(join(d, "src/components/time-circuits.tsx"), "b\n"); sh(d, "commit", "-qam", "change");
  const r = run(d);
  assert.equal(r.code, 1);
  assert.equal(r.out.cardGate.ok, false);
});

test("CLI: card in the same branch exits 0", () => {
  const d = repo(); sh(d, "checkout", "-qb", "work");
  writeFileSync(join(d, "src/components/time-circuits.tsx"), "b\n"); writeFileSync(join(d, "docs/site/cards/time-circuits.md"), "card2\n");
  sh(d, "commit", "-qam", "change");
  assert.equal(run(d).code, 0);
});

test("CLI: a Card: no change trailer in a branch commit exempts it, reason echoed", () => {
  const d = repo(); sh(d, "checkout", "-qb", "work");
  writeFileSync(join(d, "src/components/time-circuits.tsx"), "b\n"); sh(d, "commit", "-qam", "tidy\n\nCard: no change — comment-only edit");
  const r = run(d);
  assert.equal(r.code, 0);
  assert.equal(r.out.cardGate.exempt, "comment-only edit");
});

test("CLI: a repo with no docs/site/inventory.md has the gate inactive, passing with a notice (no lock-out before the cards land)", () => {
  const d = mkdtempSync(join(tmpdir(), "cardgate-"));
  sh(d, "init", "-q", "-b", "main"); writeFileSync(join(d, "a"), "1"); sh(d, "add", "-A"); sh(d, "commit", "-qm", "b"); sh(d, "checkout", "-qb", "w");
  writeFileSync(join(d, "a"), "2"); sh(d, "commit", "-qam", "c");
  const r = run(d);
  assert.equal(r.code, 0);
  assert.equal(r.out.cardGate.ok, true);
  assert.equal(r.out.cardGate.notice, "card gate inactive: no docs/site/inventory.md");
});

test("CLI: an unknown head ref still fails closed", () => {
  const d = repo();
  const r = spawnSync(process.execPath, [cli, "--repo", d, "--base", "main", "--head", "nope"], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).cardGate.ok, false);
});
