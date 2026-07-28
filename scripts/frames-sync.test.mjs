// Tests for frames-sync.mjs — vertical slices, one behavior per test, fetchImpl
// injected at the boundary (mirrors figma-node.test.mjs's jsonResponse pattern).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diffFrameTree, syncFrame } from "./frames-sync.mjs";

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: () => null },
    json: async () => body,
  };
}

function scratchDirs() {
  const framesDir = mkdtempSync(join(tmpdir(), "frames-sync-frames-"));
  const liveDir = mkdtempSync(join(tmpdir(), "frames-sync-live-"));
  return { framesDir, liveDir, cleanup: () => { rmSync(framesDir, { recursive: true, force: true }); rmSync(liveDir, { recursive: true, force: true }); } };
}

test("diffFrameTree: a node whose id matches but name changed is a rename, not add+remove", () => {
  const oldRoot = {
    id: "82:47400",
    name: "D - Project – Wild",
    type: "FRAME",
    children: [{ id: "82:47403", name: "SectionFeatureText", type: "INSTANCE" }],
  };
  const newRoot = {
    id: "82:47400",
    name: "D - Project – Wild",
    type: "FRAME",
    children: [{ id: "82:47403", name: "SectionFeatureTextV2", type: "INSTANCE" }],
  };

  const { framesRenamed, framesAdded, framesRemoved } = diffFrameTree(oldRoot, newRoot);

  assert.deepEqual(framesRenamed, [{ id: "82:47403", oldName: "SectionFeatureText", newName: "SectionFeatureTextV2", type: "INSTANCE" }]);
  assert.deepEqual(framesAdded, []);
  assert.deepEqual(framesRemoved, []);
});

test("diffFrameTree: a node with no id counterpart on the other side is reported by name alone (added/removed fallback)", () => {
  const oldRoot = {
    id: "1:1",
    name: "Frame",
    type: "FRAME",
    children: [{ id: "1:2", name: "SpacerBottom", type: "INSTANCE" }],
  };
  const newRoot = {
    id: "1:1",
    name: "Frame",
    type: "FRAME",
    children: [{ id: "1:3", name: "SpacerTop", type: "INSTANCE" }],
  };

  const { framesRenamed, framesAdded, framesRemoved } = diffFrameTree(oldRoot, newRoot);

  assert.deepEqual(framesRenamed, []);
  assert.deepEqual(framesAdded, [{ id: "1:3", name: "SpacerTop", type: "INSTANCE" }]);
  assert.deepEqual(framesRemoved, [{ id: "1:2", name: "SpacerBottom", type: "INSTANCE" }]);
});

test("syncFrame: an identical re-fetch (same hash) is a no-op — no rewrite, no changes.jsonl record, receipt marked unchanged", async () => {
  const { framesDir, liveDir, cleanup } = scratchDirs();
  const frame = { name: "wild-frame", fileKey: "DNFoVeZvmSQpSmbQhwTGgl", nodeId: "82:47400" };
  const tree = { document: { id: "82:47400", name: "D - Project – Wild", type: "FRAME", children: [] } };
  writeFileSync(join(framesDir, "wild-frame.json"), JSON.stringify(tree, null, 2) + "\n", "utf8");

  const fetchImpl = async () => jsonResponse(200, { nodes: { "82:47400": tree } });

  const result = await syncFrame({ frame, token: "tok", framesDir, liveDir, fetchImpl });

  assert.equal(result.unchanged, true);
  assert.equal(existsSync(join(liveDir, "changes.jsonl")), false);
  const receiptLines = readFileSync(join(liveDir, "receipts.jsonl"), "utf8").trim().split("\n");
  assert.equal(receiptLines.length, 1);
  const receipt = JSON.parse(receiptLines[0]);
  assert.equal(receipt.lane, "frames");
  assert.equal(receipt.fileName, "wild-frame");
  assert.equal(receipt.unchanged, true);

  cleanup();
});

async function withMappingRepo(fn) {
  const repoRoot = mkdtempSync(join(tmpdir(), "frames-sync-repo-"));
  mkdirSync(join(repoRoot, "design"), { recursive: true });
  mkdirSync(join(repoRoot, "src", "components"), { recursive: true });
  writeFileSync(join(repoRoot, "src", "components", "hero-text.tsx"), "export function HeroText() {}\n", "utf8");
  const mappingPath = join(repoRoot, "design", "figma-map.json");
  writeFileSync(
    mappingPath,
    JSON.stringify({
      $schema: "conformance-map/v1",
      components: {
        entries: [{ component: "SectionFeatureText", layer: "x", property: "y", codeLocation: "src/components/hero-text.tsx", assertion: { kind: "css-class" } } ],
        unmappable: [{ component: "CirclePattern", reason: "decorative, no code counterpart" }],
      },
    }),
    "utf8"
  );
  try {
    await fn({ repoRoot, mappingPath });
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

test("syncFrame names lane: an INSTANCE name matching neither the map vocabulary nor a component filename is flagged frame_name_unmapped", async () => {
  const { framesDir, liveDir, cleanup } = scratchDirs();
  const frame = { name: "sakara-case-study-frame", fileKey: "hb59D10C8HWhVN1mct5e2d", nodeId: "84:84495" };

  await withMappingRepo(async ({ mappingPath }) => {
    const newEntry = {
      document: {
        id: "84:84495",
        name: "D - Project – Sakara",
        type: "FRAME",
        children: [
          { id: "84:1", name: "SectionFeatureText", type: "INSTANCE", children: [] },
          { id: "84:2", name: "HeroText", type: "INSTANCE", children: [] },
          { id: "84:3", name: "MysteryWidget", type: "INSTANCE", children: [] },
        ],
      },
    };
    const fetchImpl = async () => jsonResponse(200, { nodes: { "84:84495": newEntry } });

    await syncFrame({ frame, token: "tok", framesDir, liveDir, fetchImpl, conformanceMapPath: mappingPath });

    const lines = readFileSync(join(liveDir, "conformance.jsonl"), "utf8").trim().split("\n");
    const defects = lines.map((l) => JSON.parse(l));
    const unmapped = defects.filter((d) => d.type === "frame_name_unmapped");
    assert.equal(unmapped.length, 1);
    assert.equal(unmapped[0].name, "MysteryWidget");
    assert.equal(unmapped[0].frame, "sakara-case-study-frame");
  });

  cleanup();
});

test("syncFrame: CONFORMANCE_MAP_PATH unset appends nothing to conformance.jsonl", async () => {
  const { framesDir, liveDir, cleanup } = scratchDirs();
  const frame = { name: "sakara-case-study-frame", fileKey: "hb59D10C8HWhVN1mct5e2d", nodeId: "84:84495" };
  const newEntry = { document: { id: "84:84495", name: "D - Project – Sakara", type: "FRAME", children: [{ id: "84:3", name: "MysteryWidget", type: "INSTANCE", children: [] }] } };
  const fetchImpl = async () => jsonResponse(200, { nodes: { "84:84495": newEntry } });

  const savedEnv = process.env.CONFORMANCE_MAP_PATH;
  delete process.env.CONFORMANCE_MAP_PATH;
  try {
    await syncFrame({ frame, token: "tok", framesDir, liveDir, fetchImpl });
  } finally {
    if (savedEnv !== undefined) process.env.CONFORMANCE_MAP_PATH = savedEnv;
  }

  assert.equal(existsSync(join(liveDir, "conformance.jsonl")), false);

  cleanup();
});
