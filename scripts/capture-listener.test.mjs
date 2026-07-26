// Integration tests for capture-listener.mjs's conformance hook — spawns the
// real server (child process, ephemeral port, scratch CAPTURES_DIR) and
// drives it over HTTP, per test-first's "mock only at system boundaries":
// this IS the boundary (an HTTP server), so no mocking, just a real process.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const LISTENER_PATH = join(import.meta.dirname, "capture-listener.mjs");

function exportBody(overrides = {}) {
  return {
    header: { fileName: "Test File", pluginVersion: "1.0.0", exportedAt: Date.now(), counts: {} },
    collections: [{ name: "color", modes: ["light"], variables: [{ name: "content/primary", valuesByMode: { light: "#000000" } }] }],
    ...overrides,
  };
}

async function withListener(env, fn) {
  const port = 20000 + Math.floor(Math.random() * 10000);
  const child = spawn("node", [LISTENER_PATH], {
    env: { ...process.env, CAPTURE_LISTENER_PORT: String(port), ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetch(`${base}/health`);
        if (res.ok) break;
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    await fn(base);
  } finally {
    child.kill();
  }
}

test("CONFORMANCE_MAP_PATH set: a changed sync appends a conformance.jsonl record", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));
  const repoRoot = mkdtempSync(join(tmpdir(), "conformance-repo-test-"));
  mkdirSync(join(repoRoot, "design"), { recursive: true });
  writeFileSync(join(repoRoot, "styles.css"), `:root {\n  --content-primary: #000000;\n}\n`, "utf8");
  const mappingPath = join(repoRoot, "design", "figma-map.json");
  writeFileSync(
    mappingPath,
    JSON.stringify({
      $schema: "conformance-map/v1",
      entries: { "color/content/primary": { codeLocation: "styles.css", tokenName: "--content-primary", extraction: "css-root-dark" } },
    }),
    "utf8"
  );

  await withListener({ CAPTURES_DIR: capturesDir, CONFORMANCE_MAP_PATH: mappingPath }, async (base) => {
    const res = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportBody()) });
    assert.equal(res.status, 200);
  });

  const conformancePath = join(capturesDir, "conformance.jsonl");
  assert.equal(existsSync(conformancePath), true);
  const record = JSON.parse(readFileSync(conformancePath, "utf8").trim().split("\n")[0]);
  assert.equal(record.ok, true);
  assert.deepEqual(record.defects, []);

  rmSync(capturesDir, { recursive: true, force: true });
  rmSync(repoRoot, { recursive: true, force: true });
});

test("CONFORMANCE_MAP_PATH set with a components section: binding drift appears in conformance.jsonl under `binding`", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));
  const repoRoot = mkdtempSync(join(tmpdir(), "conformance-repo-test-"));
  mkdirSync(join(repoRoot, "design"), { recursive: true });
  mkdirSync(join(repoRoot, "src"), { recursive: true });
  writeFileSync(join(repoRoot, "src", "hero.tsx"), `titleStep="title-style1-500"`, "utf8");
  const mappingPath = join(repoRoot, "design", "figma-map.json");
  writeFileSync(
    mappingPath,
    JSON.stringify({
      $schema: "conformance-map/v1",
      components: {
        entries: [
          {
            component: "HeroText",
            layer: "wrapper/Content/Title/Title",
            property: "textStyle",
            codeLocation: "src/hero.tsx",
            assertion: { kind: "css-class" },
          },
        ],
      },
    }),
    "utf8"
  );

  const componentsBody = {
    header: { fileName: "Test File", pluginVersion: "1.0.0", exportedAt: Date.now(), counts: {} },
    collections: [],
    components: {
      standalone: [],
      sets: [
        {
          name: "HeroText",
          key: "abc",
          variants: [
            { name: "device=desktop", key: "v1", bindings: [{ layer: "wrapper/Content/Title/Title", property: "textStyle", value: "title-style1/300" }] },
          ],
        },
      ],
    },
  };

  await withListener({ CAPTURES_DIR: capturesDir, CONFORMANCE_MAP_PATH: mappingPath }, async (base) => {
    const res = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(componentsBody) });
    assert.equal(res.status, 200);
  });

  const conformancePath = join(capturesDir, "conformance.jsonl");
  const record = JSON.parse(readFileSync(conformancePath, "utf8").trim().split("\n")[0]);
  assert.equal(record.binding.ok, false);
  assert.equal(record.binding.defects.length, 1);
  assert.equal(record.binding.defects[0].type, "binding_mismatch");

  rmSync(capturesDir, { recursive: true, force: true });
  rmSync(repoRoot, { recursive: true, force: true });
});

test("CONFORMANCE_MAP_PATH unset: behavior unchanged, no conformance.jsonl written", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const res = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportBody()) });
    assert.equal(res.status, 200);
  });

  assert.equal(existsSync(join(capturesDir, "conformance.jsonl")), false);
  assert.equal(existsSync(join(capturesDir, "changes.jsonl")), true);
  assert.equal(existsSync(join(capturesDir, "receipts.jsonl")), true);

  rmSync(capturesDir, { recursive: true, force: true });
});
