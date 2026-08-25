// Tests for vault-orphan-scan.mjs — vertical slices, one behavior per test.
// Run: node --test hooks/scripts/vault-orphan-scan.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanVaultForOrphans } from "./vault-orphan-scan.mjs";

function makeVault() {
  return mkdtempSync(join(tmpdir(), "vault-orphan-scan-test-"));
}

// index.md and hub.md link each other in every "clean" fixture below — a
// real vault's root index is itself linked from somewhere, and the scanner
// has no special case for hub files, so hub.md needs an inbound link too.
// The mutual link keeps each fixture's own graph fully clean so the
// assertion is only about the note actually under test.
function writeCleanIndexAndHub(root, hubBody) {
  writeFileSync(join(root, "index.md"), "# Vault\n\n- [[hub]]\n", "utf8");
  writeFileSync(join(root, "hub.md"), `# Hub\n\n- [[index]]\n\n${hubBody}`, "utf8");
}

test("a clean vault (every note linked from its hub) reports zero orphans", () => {
  const root = makeVault();
  try {
    writeCleanIndexAndHub(root, "## Decisions\n\n- [[widget-color-decision]]\n");
    writeFileSync(
      join(root, "widget-color-decision.md"),
      ["---", "name: widget-color-decision", "description: chose blue.", "---", "", "Body."].join("\n"),
      "utf8"
    );
    const orphans = scanVaultForOrphans(root);
    assert.deepEqual(orphans, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a note with a Hubs: line pointing AT the hub but no inbound link is an orphan", () => {
  // The exact straggler shape: the note names its hub, but the hub never
  // links back — a "Hubs:" line does not satisfy the wiring requirement.
  const root = makeVault();
  try {
    writeCleanIndexAndHub(root, "## Decisions\n");
    writeFileSync(
      join(root, "straggler-decision.md"),
      ["---", "name: straggler-decision", "description: an orphan.", "---", "", "Hubs: [[hub]]", "", "Body."].join("\n"),
      "utf8"
    );
    const orphans = scanVaultForOrphans(root);
    assert.equal(orphans.length, 1);
    assert.ok(orphans[0].endsWith("straggler-decision.md"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a relative markdown link also counts as an inbound link", () => {
  const root = makeVault();
  try {
    writeCleanIndexAndHub(root, "- [linked note](./linked-note.md)\n");
    writeFileSync(join(root, "linked-note.md"), "# Linked Note\n\nBody.\n", "utf8");
    const orphans = scanVaultForOrphans(root);
    assert.deepEqual(orphans, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a date-prefixed note linked only via its frontmatter name: (not its filename) is an orphan — the live bug class", () => {
  // Tonight's actual failure: the hub backlink used [[frontmatter-name]]
  // against a date-prefixed filename. Obsidian never resolves by name:, so
  // this "fixed" link stayed broken and the note stayed orphaned.
  const root = makeVault();
  try {
    writeCleanIndexAndHub(root, "- [[the-real-name]]\n");
    // filename stem differs from frontmatter name — the hub links the name,
    // not the actual filename, which is exactly the bug that shipped tonight.
    writeFileSync(
      join(root, "2026-08-25-widget-decision.md"),
      ["---", "name: the-real-name", "description: x.", "---", "", "Body."].join("\n"),
      "utf8"
    );
    const orphans = scanVaultForOrphans(root);
    assert.equal(orphans.length, 1);
    assert.ok(orphans[0].endsWith("2026-08-25-widget-decision.md"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a note linked via [[stem|display]] (pipe-aliased wikilink) is not an orphan", () => {
  const root = makeVault();
  try {
    writeCleanIndexAndHub(root, "- [[2026-08-25-widget-decision|the widget decision]]\n");
    writeFileSync(
      join(root, "2026-08-25-widget-decision.md"),
      ["---", "name: widget-decision", "description: x.", "---", "", "Body."].join("\n"),
      "utf8"
    );
    const orphans = scanVaultForOrphans(root);
    assert.deepEqual(orphans, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a note linked via a declared frontmatter alias (not its filename) is not an orphan", () => {
  const root = makeVault();
  try {
    writeCleanIndexAndHub(root, "- [[widget-decision-alias]]\n");
    writeFileSync(
      join(root, "2026-08-25-widget-decision.md"),
      ["---", "name: widget-decision", "aliases: [widget-decision-alias]", "description: x.", "---", "", "Body."].join("\n"),
      "utf8"
    );
    const orphans = scanVaultForOrphans(root);
    assert.deepEqual(orphans, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a note linked via a block-list frontmatter alias is not an orphan", () => {
  const root = makeVault();
  try {
    writeCleanIndexAndHub(root, "- [[widget-decision-alias]]\n");
    writeFileSync(
      join(root, "2026-08-25-widget-decision.md"),
      ["---", "name: widget-decision", "aliases:", "  - widget-decision-alias", "description: x.", "---", "", "Body."].join("\n"),
      "utf8"
    );
    const orphans = scanVaultForOrphans(root);
    assert.deepEqual(orphans, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test(".obsidian/ and estate/ directories are excluded from the scan entirely", () => {
  const root = makeVault();
  try {
    mkdirSync(join(root, ".obsidian"), { recursive: true });
    writeFileSync(join(root, ".obsidian", "workspace.md"), "not a real note\n", "utf8");
    mkdirSync(join(root, "estate"), { recursive: true });
    writeFileSync(join(root, "estate", "estate-map.md"), "# Estate Map\n\nno inbound links either.\n", "utf8");
    const orphans = scanVaultForOrphans(root);
    assert.deepEqual(orphans, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a nonexistent vault root is skipped, not a crash", () => {
  const root = makeVault();
  try {
    const bogusRoot = join(root, "does-not-exist");
    const orphans = scanVaultForOrphans(bogusRoot);
    assert.deepEqual(orphans, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("two mutually-unlinked notes both report as orphans, and the count matches", () => {
  const root = makeVault();
  try {
    writeFileSync(join(root, "hub.md"), "# Hub\n\nnothing linked yet.\n", "utf8");
    writeFileSync(join(root, "orphan-one.md"), "# Orphan One\n\nBody.\n", "utf8");
    writeFileSync(join(root, "orphan-two.md"), "# Orphan Two\n\nBody.\n", "utf8");
    const orphans = scanVaultForOrphans(root);
    // hub.md itself is also unlinked-from here (no index.md pointing at it) — three total, sorted.
    assert.equal(orphans.length, 3);
    assert.deepEqual(
      orphans.map((o) => o.split("/").pop()).sort(),
      ["hub.md", "orphan-one.md", "orphan-two.md"]
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
