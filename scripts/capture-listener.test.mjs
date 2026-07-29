// Integration tests for capture-listener.mjs's conformance hook — spawns the
// real server (child process, ephemeral port, scratch CAPTURES_DIR) and
// drives it over HTTP, per test-first's "mock only at system boundaries":
// this IS the boundary (an HTTP server), so no mocking, just a real process.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
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

test("changes.jsonl reports a raw->raw layer-binding value change (regression: instance-size change on an unchanged layer path was silently dropped)", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  const bindingsBody = (sizeValue) => ({
    header: { fileName: "Test File", pluginVersion: "1.0.0", exportedAt: Date.now(), counts: {} },
    collections: [],
    components: {
      standalone: [],
      sets: [
        {
          name: "HeroText",
          key: "hero-key",
          variants: [
            {
              name: "device=desktop",
              key: "v1",
              bindings: [{ layer: "wrapper/Content/SpacerTop", property: "instance", value: sizeValue }],
            },
          ],
        },
      ],
    },
  });

  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const first = await fetch(`${base}/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bindingsBody("screen-100")),
    });
    assert.equal(first.status, 200);

    const second = await fetch(`${base}/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bindingsBody("screen-400")),
    });
    assert.equal(second.status, 200);
  });

  const lines = readFileSync(join(capturesDir, "changes.jsonl"), "utf8").trim().split("\n");
  const secondRecord = JSON.parse(lines[1]);
  assert.equal(secondRecord.changed.layerBindings.length, 1);
  assert.deepEqual(secondRecord.changed.layerBindings[0], {
    set: "HeroText",
    variant: "device=desktop",
    layer: "wrapper/Content/SpacerTop",
    property: "instance",
    from: "screen-100",
    to: "screen-400",
    type: "layer_binding_changed",
  });

  rmSync(capturesDir, { recursive: true, force: true });
});

test("GET /todos serves the seeded queue", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));
  writeFileSync(join(capturesDir, "todo-queue.json"), JSON.stringify({ items: [{ id: "todo-1", text: "Do the thing" }] }), "utf8");

  let body;
  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const res = await fetch(`${base}/todos`);
    assert.equal(res.status, 200);
    body = await res.json();
  });

  assert.deepEqual(body, { items: [{ id: "todo-1", text: "Do the thing" }] });

  rmSync(capturesDir, { recursive: true, force: true });
});

test("POST /todos enqueues items and dedupes by text", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));
  writeFileSync(join(capturesDir, "todo-queue.json"), JSON.stringify({ items: [{ id: "todo-1", text: "Existing item" }] }), "utf8");

  let body;
  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const res = await fetch(`${base}/todos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [{ text: "Existing item" }, { text: "New item" }, { id: "todo-explicit", text: "Explicit id item" }] }),
    });
    assert.equal(res.status, 200);
    body = await res.json();
  });

  assert.equal(body.items.length, 3);
  assert.equal(body.items[0].text, "Existing item");
  assert.equal(body.items[0].id, "todo-1");
  assert.equal(body.items[1].text, "New item");
  assert.equal(typeof body.items[1].id, "string");
  assert.notEqual(body.items[1].id, "");
  assert.deepEqual(body.items[2], { id: "todo-explicit", text: "Explicit id item" });

  const onDisk = JSON.parse(readFileSync(join(capturesDir, "todo-queue.json"), "utf8"));
  assert.equal(onDisk.items.length, 3);

  rmSync(capturesDir, { recursive: true, force: true });
});

test("POST /todos/ack removes the given ids from the queue", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));
  writeFileSync(
    join(capturesDir, "todo-queue.json"),
    JSON.stringify({ items: [{ id: "todo-1", text: "First" }, { id: "todo-2", text: "Second" }, { id: "todo-3", text: "Third" }] }),
    "utf8"
  );

  let body;
  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const res = await fetch(`${base}/todos/ack`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["todo-1", "todo-3"] }),
    });
    assert.equal(res.status, 200);
    body = await res.json();
  });

  assert.deepEqual(body.items, [{ id: "todo-2", text: "Second" }]);

  const onDisk = JSON.parse(readFileSync(join(capturesDir, "todo-queue.json"), "utf8"));
  assert.deepEqual(onDisk.items, [{ id: "todo-2", text: "Second" }]);

  rmSync(capturesDir, { recursive: true, force: true });
});

test("POST /todos/ack with a done[] field logs a receipt with lane: todos", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));
  writeFileSync(join(capturesDir, "todo-queue.json"), JSON.stringify({ items: [{ id: "todo-1", text: "First" }] }), "utf8");

  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const res = await fetch(`${base}/todos/ack`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["todo-1"], done: ["todo-1"] }),
    });
    assert.equal(res.status, 200);
  });

  const receipts = readFileSync(join(capturesDir, "receipts.jsonl"), "utf8").trim().split("\n");
  const receipt = JSON.parse(receipts[receipts.length - 1]);
  assert.equal(receipt.lane, "todos");
  assert.deepEqual(receipt.done, ["todo-1"]);

  rmSync(capturesDir, { recursive: true, force: true });
});

test("POST /todos/push persists the full pushed state to todo-state.json and logs a todos receipt", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  const pushedItems = [
    { id: "t-1", text: "**Fix** the header", status: "todo" },
    { id: "t-2", text: "Ship it", status: "inprogress" },
  ];

  let body;
  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const res = await fetch(`${base}/todos/push`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: pushedItems }),
    });
    assert.equal(res.status, 200);
    body = await res.json();
  });

  assert.deepEqual(body.items, pushedItems);

  const onDisk = JSON.parse(readFileSync(join(capturesDir, "todo-state.json"), "utf8"));
  assert.deepEqual(onDisk.items, pushedItems);

  const receipts = readFileSync(join(capturesDir, "receipts.jsonl"), "utf8").trim().split("\n");
  const receipt = JSON.parse(receipts[receipts.length - 1]);
  assert.equal(receipt.lane, "todos");
  assert.equal(receipt.action, "push");
  assert.equal(receipt.count, 2);

  rmSync(capturesDir, { recursive: true, force: true });
});

test("OPTIONS /todos answers the CORS preflight for the Figma plugin's cross-origin fetch", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  let res;
  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    res = await fetch(`${base}/todos`, { method: "OPTIONS" });
  });

  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.equal(res.headers.get("access-control-allow-methods"), "POST, GET, OPTIONS");
  assert.equal(res.headers.get("access-control-allow-headers"), "content-type");

  rmSync(capturesDir, { recursive: true, force: true });
});

test("todo-queue.json is persisted atomically: no leftover tmp file, content survives back-to-back writes", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const enqueueRes = await fetch(`${base}/todos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [{ id: "todo-1", text: "First" }, { id: "todo-2", text: "Second" }] }),
    });
    assert.equal(enqueueRes.status, 200);

    const ackRes = await fetch(`${base}/todos/ack`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["todo-1"] }),
    });
    assert.equal(ackRes.status, 200);
  });

  const entries = readdirSync(capturesDir);
  assert.equal(entries.some((name) => name.includes(".tmp-")), false);

  const onDisk = JSON.parse(readFileSync(join(capturesDir, "todo-queue.json"), "utf8"));
  assert.deepEqual(onDisk.items, [{ id: "todo-2", text: "Second" }]);

  rmSync(capturesDir, { recursive: true, force: true });
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
