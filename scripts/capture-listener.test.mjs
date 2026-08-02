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

// v2 schema fixture: the operator's live capture plugin's richer DS-documentation
// payload — component descriptions, sectioned Examples, resolved template-frame
// instance state, latent capability booleans, and structural warnings.
function v2ExportBody(overrides = {}) {
  return {
    header: { fileName: "Test File", pluginVersion: "2.0.0", exportedAt: Date.now(), counts: {}, schemaVersion: 2 },
    collections: [],
    componentSets: [{ key: "set-hero", name: "HeroText", description: "Marketing hero block." }],
    exampleStructure: [{ name: "M-Example", frames: [{ id: "frame-1", name: "Default" }] }],
    templateFrames: [
      {
        id: "tf-1",
        name: "Homepage",
        instances: [
          {
            id: "inst-1",
            name: "Hero",
            component: "HeroText",
            variantProps: { device: "desktop", height: "L" },
            properties: { title: "Welcome" },
            overrides: [{ id: "ov-1", property: "spacerTop", value: "40" }],
          },
        ],
      },
    ],
    latentCapabilities: [{ id: "cap-1", name: "has-background", visible: true, binding: "color/surface/raised" }],
    warnings: [
      {
        type: "malformed_spacer_name",
        nodeId: "spacer-1",
        nodeName: "SpaceBottom",
        context: "Homepage/Hero/SpaceBottom",
        message: 'Homepage/Hero/SpaceBottom has a malformed spacer name "SpaceBottom" — expected one of SpacerTop/SpacerBottom/SpacerHorizontal/SpacerVertical.',
      },
    ],
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

test("POST /capture accepts a v2 payload and persists every new field losslessly", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));
  const body = v2ExportBody();

  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const res = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(res.status, 200);
  });

  const written = JSON.parse(readFileSync(join(capturesDir, "test-file-variables-styles.json"), "utf8"));
  assert.equal(written.header.schemaVersion, 2);
  assert.deepEqual(written.componentSets, body.componentSets);
  assert.deepEqual(written.exampleStructure, body.exampleStructure);
  assert.deepEqual(written.templateFrames, body.templateFrames);
  assert.deepEqual(written.latentCapabilities, body.latentCapabilities);
  assert.deepEqual(written.warnings, body.warnings);

  rmSync(capturesDir, { recursive: true, force: true });
});

test("POST /capture rejects a v2 payload whose new fields have the wrong shape", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const badSchemaVersion = await fetch(`${base}/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(v2ExportBody({ header: { ...v2ExportBody().header, schemaVersion: "two" } })),
    });
    assert.equal(badSchemaVersion.status, 400);

    const badComponentSets = await fetch(`${base}/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(v2ExportBody({ componentSets: { not: "an array" } })),
    });
    assert.equal(badComponentSets.status, 400);

    const badTemplateFrames = await fetch(`${base}/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(v2ExportBody({ templateFrames: "nope" })),
    });
    assert.equal(badTemplateFrames.status, 400);

    const badWarnings = await fetch(`${base}/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(v2ExportBody({ warnings: "nope" })),
    });
    assert.equal(badWarnings.status, 400);
  });

  rmSync(capturesDir, { recursive: true, force: true });
});

test("changes.jsonl records carry schemaVersion + warningCount on both the initial and a diffed sync", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const first = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v2ExportBody()) });
    assert.equal(first.status, 200);

    const second = await fetch(`${base}/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(v2ExportBody({ warnings: ["A different warning."] })),
    });
    assert.equal(second.status, 200);
  });

  const lines = readFileSync(join(capturesDir, "changes.jsonl"), "utf8").trim().split("\n");
  const initial = JSON.parse(lines[0]);
  const diffed = JSON.parse(lines[1]);

  assert.equal(initial.schemaVersion, 2);
  assert.equal(initial.warningCount, 1);
  assert.equal(diffed.schemaVersion, 2);
  assert.equal(diffed.warningCount, 1);

  rmSync(capturesDir, { recursive: true, force: true });
});

test("changes.jsonl records default to schemaVersion 1 and warningCount 0 for a v1 payload", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const res = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportBody()) });
    assert.equal(res.status, 200);
  });

  const record = JSON.parse(readFileSync(join(capturesDir, "changes.jsonl"), "utf8").trim().split("\n")[0]);
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.warningCount, 0);

  rmSync(capturesDir, { recursive: true, force: true });
});

test("POST /capture response body: the initial sync carries warningCount but no summary (nothing to diff against yet)", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const res = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v2ExportBody()) });
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.warningCount, 1);
    assert.equal("summary" in body, false);
  });

  rmSync(capturesDir, { recursive: true, force: true });
});

test("POST /capture response body: a diffed sync surfaces warningCount + the cross-bucket summary so the UI can consume it without reading changes.jsonl", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const first = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v2ExportBody()) });
    assert.equal(first.status, 200);

    const second = await fetch(`${base}/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(v2ExportBody({ warnings: ["A different warning.", "Second warning."] })),
    });
    const body = await second.json();
    assert.equal(body.ok, true);
    assert.equal(body.warningCount, 2);
    assert.equal(typeof body.summary, "object");
    assert.equal(typeof body.summary.modified, "number");
  });

  rmSync(capturesDir, { recursive: true, force: true });
});

test("POST /capture response body: an unchanged (no-op) sync has no summary field", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const first = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportBody()) });
    assert.equal(first.status, 200);

    const second = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportBody()) });
    const body = await second.json();
    assert.equal(body.ok, true);
    assert.equal(body.unchanged, true);
    assert.equal("summary" in body, false);
  });

  rmSync(capturesDir, { recursive: true, force: true });
});

test("changes.jsonl reports component_description_changed when a componentSet's description changes", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const first = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v2ExportBody()) });
    assert.equal(first.status, 200);

    const second = await fetch(`${base}/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(v2ExportBody({ componentSets: [{ key: "set-hero", name: "HeroText", description: "Updated hero copy." }] })),
    });
    assert.equal(second.status, 200);
  });

  const lines = readFileSync(join(capturesDir, "changes.jsonl"), "utf8").trim().split("\n");
  const diffed = JSON.parse(lines[1]);
  assert.deepEqual(diffed.changed.componentSets, [
    { type: "component_description_changed", key: "set-hero", name: "HeroText", old: "Marketing hero block.", new: "Updated hero copy." },
  ]);

  rmSync(capturesDir, { recursive: true, force: true });
});

test("changes.jsonl reports example_section_added/removed and example_frame_added/removed/renamed", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const first = await fetch(`${base}/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        v2ExportBody({
          exampleStructure: [
            { name: "M-Example", frames: [{ id: "frame-1", name: "Default" }, { id: "frame-2", name: "Empty state" }] },
            { name: "D-Example", frames: [{ id: "frame-3", name: "Default" }] },
          ],
        })
      ),
    });
    assert.equal(first.status, 200);

    const second = await fetch(`${base}/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        v2ExportBody({
          exampleStructure: [
            { name: "M-Example", frames: [{ id: "frame-1", name: "Default (renamed)" }, { id: "frame-4", name: "New frame" }] },
          ],
        })
      ),
    });
    assert.equal(second.status, 200);
  });

  const lines = readFileSync(join(capturesDir, "changes.jsonl"), "utf8").trim().split("\n");
  const diffed = JSON.parse(lines[1]);
  const byType = (type) => diffed.changed.examples.filter((r) => r.type === type);

  assert.deepEqual(byType("example_section_removed"), [{ type: "example_section_removed", name: "D-Example" }]);
  assert.deepEqual(byType("example_frame_removed"), [{ type: "example_frame_removed", section: "M-Example", name: "Empty state" }]);
  assert.deepEqual(byType("example_frame_added"), [{ type: "example_frame_added", section: "M-Example", name: "New frame" }]);
  assert.deepEqual(byType("example_frame_renamed"), [
    { type: "example_frame_renamed", section: "M-Example", id: "frame-1", oldName: "Default", newName: "Default (renamed)" },
  ]);
  assert.deepEqual(byType("example_section_added"), []);

  rmSync(capturesDir, { recursive: true, force: true });
});

test("changes.jsonl reports the full templateFrames diff surface, filtering device-axis variant noise via the axis-ownership rule", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  const before = [
    {
      id: "tf-1",
      name: "Homepage",
      instances: [
        {
          id: "inst-1",
          name: "Hero",
          component: "HeroText",
          variantProps: { device: "desktop", height: "L" },
          properties: { title: "Welcome" },
          overrides: [
            { id: "ov-1", property: "spacerTop", value: "40" },
            { id: "ov-2", property: "spacerBottom", value: "20" },
          ],
        },
        { id: "inst-2", name: "OldWidget", component: "Widget", variantProps: {}, properties: {}, overrides: [] },
      ],
    },
    { id: "tf-2", name: "AboutPage", instances: [] },
  ];

  const after = [
    {
      id: "tf-1",
      name: "Homepage",
      instances: [
        {
          id: "inst-1",
          name: "Hero",
          component: "HeroText",
          variantProps: { device: "mobile", height: "M" },
          properties: { title: "Welcome back" },
          overrides: [
            { id: "ov-1", property: "spacerTop", value: "80" },
            { id: "ov-3", property: "spacerLeft", value: "10" },
          ],
        },
        { id: "inst-3", name: "NewWidget", component: "Widget", variantProps: {}, properties: {}, overrides: [] },
      ],
    },
    { id: "tf-3", name: "ContactPage", instances: [] },
  ];

  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const first = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v2ExportBody({ templateFrames: before })) });
    assert.equal(first.status, 200);

    const second = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v2ExportBody({ templateFrames: after })) });
    assert.equal(second.status, 200);
  });

  const lines = readFileSync(join(capturesDir, "changes.jsonl"), "utf8").trim().split("\n");
  const diffed = JSON.parse(lines[1]);
  const byType = (type) => diffed.changed.templateFrames.filter((r) => r.type === type);

  assert.deepEqual(byType("template_frame_added"), [{ type: "template_frame_added", name: "ContactPage" }]);
  assert.deepEqual(byType("template_frame_removed"), [{ type: "template_frame_removed", name: "AboutPage" }]);
  assert.deepEqual(byType("template_instance_added"), [{ type: "template_instance_added", frame: "Homepage", name: "NewWidget" }]);
  assert.deepEqual(byType("template_instance_removed"), [{ type: "template_instance_removed", frame: "Homepage", name: "OldWidget" }]);
  // device is block-owned (axis-ownership global rule) — its change is adaptation noise, never reported.
  assert.deepEqual(byType("template_variant_changed"), [
    { type: "template_variant_changed", frame: "Homepage", instance: "Hero", axis: "height", old: "L", new: "M" },
  ]);
  assert.deepEqual(byType("template_properties_changed"), [
    { type: "template_properties_changed", frame: "Homepage", instance: "Hero", property: "title", old: "Welcome", new: "Welcome back" },
  ]);
  const overrideRecords = byType("template_overrides_changed");
  assert.equal(overrideRecords.length, 3);
  assert.deepEqual(
    overrideRecords.find((r) => r.id === "ov-1"),
    { type: "template_overrides_changed", frame: "Homepage", instance: "Hero", id: "ov-1", property: "spacerTop", change: "changed", old: "40", new: "80" }
  );
  assert.deepEqual(
    overrideRecords.find((r) => r.id === "ov-2"),
    { type: "template_overrides_changed", frame: "Homepage", instance: "Hero", id: "ov-2", property: "spacerBottom", change: "removed", old: "20" }
  );
  assert.deepEqual(
    overrideRecords.find((r) => r.id === "ov-3"),
    { type: "template_overrides_changed", frame: "Homepage", instance: "Hero", id: "ov-3", property: "spacerLeft", change: "added", new: "10" }
  );

  rmSync(capturesDir, { recursive: true, force: true });
});

test("template_variant_changed honors a componentSet's @axis-ownership annotation over the global rule", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  const componentSets = [{ key: "set-hero", name: "HeroText", description: "Marketing hero block.\n@axis-ownership device=layout" }];
  const before = [{ id: "tf-1", name: "Homepage", instances: [{ id: "inst-1", name: "Hero", component: "HeroText", variantProps: { device: "desktop" }, properties: {}, overrides: [] }] }];
  const after = [{ id: "tf-1", name: "Homepage", instances: [{ id: "inst-1", name: "Hero", component: "HeroText", variantProps: { device: "mobile" }, properties: {}, overrides: [] }] }];

  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const first = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v2ExportBody({ componentSets, templateFrames: before })) });
    assert.equal(first.status, 200);

    const second = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v2ExportBody({ componentSets, templateFrames: after })) });
    assert.equal(second.status, 200);
  });

  const lines = readFileSync(join(capturesDir, "changes.jsonl"), "utf8").trim().split("\n");
  const diffed = JSON.parse(lines[1]);
  // annotation flips device to layout-owned for this set, so its change now reports instead of being suppressed.
  assert.deepEqual(diffed.changed.templateFrames.filter((r) => r.type === "template_variant_changed"), [
    { type: "template_variant_changed", frame: "Homepage", instance: "Hero", axis: "device", old: "desktop", new: "mobile" },
  ]);

  rmSync(capturesDir, { recursive: true, force: true });
});

test("changes.jsonl reports capability_added/removed/visibility_changed/binding_changed", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  const before = [
    { id: "cap-1", name: "has-background", visible: true, binding: "color/surface/raised" },
    { id: "cap-2", name: "has-icon", visible: false, binding: null },
    { id: "cap-3", name: "has-border", visible: true, binding: "color/border/default" },
  ];
  const after = [
    { id: "cap-1", name: "has-background", visible: false, binding: "color/surface/raised" },
    { id: "cap-2", name: "has-icon", visible: false, binding: "color/icon/muted" },
    { id: "cap-4", name: "has-shadow", visible: true, binding: null },
  ];

  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const first = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v2ExportBody({ latentCapabilities: before })) });
    assert.equal(first.status, 200);

    const second = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v2ExportBody({ latentCapabilities: after })) });
    assert.equal(second.status, 200);
  });

  const lines = readFileSync(join(capturesDir, "changes.jsonl"), "utf8").trim().split("\n");
  const diffed = JSON.parse(lines[1]);
  const byType = (type) => diffed.changed.capabilities.filter((r) => r.type === type);

  assert.deepEqual(byType("capability_added"), [{ type: "capability_added", id: "cap-4", name: "has-shadow" }]);
  assert.deepEqual(byType("capability_removed"), [{ type: "capability_removed", id: "cap-3", name: "has-border" }]);
  assert.deepEqual(byType("capability_visibility_changed"), [
    { type: "capability_visibility_changed", id: "cap-1", name: "has-background", old: true, new: false },
  ]);
  assert.deepEqual(byType("capability_binding_changed"), [
    { type: "capability_binding_changed", id: "cap-2", name: "has-icon", old: null, new: "color/icon/muted" },
  ]);

  rmSync(capturesDir, { recursive: true, force: true });
});

test("GET /warnings returns [] before any capture has synced", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  let body;
  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const res = await fetch(`${base}/warnings`);
    assert.equal(res.status, 200);
    body = await res.json();
  });

  assert.deepEqual(body, []);

  rmSync(capturesDir, { recursive: true, force: true });
});

test("GET /warnings returns the latest v2 capture's warnings[]", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  let body;
  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const res = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v2ExportBody({ warnings: ["First warning.", "Second warning."] })) });
    assert.equal(res.status, 200);

    const warningsRes = await fetch(`${base}/warnings`);
    assert.equal(warningsRes.status, 200);
    body = await warningsRes.json();
  });

  assert.deepEqual(body, ["First warning.", "Second warning."]);

  rmSync(capturesDir, { recursive: true, force: true });
});

test("GET /warnings returns [] for a v1 capture (no warnings field)", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  let body;
  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const res = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportBody()) });
    assert.equal(res.status, 200);

    const warningsRes = await fetch(`${base}/warnings`);
    body = await warningsRes.json();
  });

  assert.deepEqual(body, []);

  rmSync(capturesDir, { recursive: true, force: true });
});

test("v1 regression: a diffed v1 sync gets empty v2 diff buckets, not errors or garbage", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const first = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportBody()) });
    assert.equal(first.status, 200);

    const second = await fetch(`${base}/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(exportBody({ collections: [{ name: "color", modes: ["light"], variables: [{ name: "content/primary", valuesByMode: { light: "#111111" } }] }] })),
    });
    assert.equal(second.status, 200);
  });

  const lines = readFileSync(join(capturesDir, "changes.jsonl"), "utf8").trim().split("\n");
  const diffed = JSON.parse(lines[1]);

  assert.equal(diffed.schemaVersion, 1);
  assert.equal(diffed.warningCount, 0);
  assert.deepEqual(diffed.changed.componentSets, []);
  assert.deepEqual(diffed.changed.examples, []);
  assert.deepEqual(diffed.changed.templateFrames, []);
  assert.deepEqual(diffed.changed.capabilities, []);
  // pre-existing v1 diff behavior is untouched: the variable value change still reports.
  assert.equal(diffed.changed.variables.length, 1);

  rmSync(capturesDir, { recursive: true, force: true });
});

test("regression: a producer that stops sending body.components (e.g. the live plugin's v2 export, which never carries it) does not report every previously-known component as removed", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  const withComponents = {
    header: { fileName: "Test File", pluginVersion: "1.0.0", exportedAt: Date.now(), counts: {} },
    collections: [],
    components: {
      standalone: [{ name: "Icon" }],
      sets: [{ name: "HeroText", key: "hero-key", variants: [{ name: "device=desktop", key: "v1" }] }],
    },
  };
  // A v2 plugin export never carries `components` at all — a field that was
  // reported before and simply isn't reported this sync is not the same
  // claim as "it was deleted from the file".
  const withoutComponents = v2ExportBody();

  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const first = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(withComponents) });
    assert.equal(first.status, 200);

    const second = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(withoutComponents) });
    assert.equal(second.status, 200);
  });

  const lines = readFileSync(join(capturesDir, "changes.jsonl"), "utf8").trim().split("\n");
  const diffed = JSON.parse(lines[1]);

  assert.deepEqual(diffed.changed.componentsRemoved, []);
  assert.deepEqual(diffed.changed.componentsAdded, []);
  assert.deepEqual(diffed.changed.components, []);

  rmSync(capturesDir, { recursive: true, force: true });
});

test("regression: a v2 producer that stops sending a v2 bucket (e.g. reverting to a v1 export) does not report every previously-known entry in that bucket as removed", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  const withCapabilities = v2ExportBody({
    latentCapabilities: [{ id: "cap-1", name: "has-background", visible: false, binding: "color/surface/raised" }],
  });
  const v1Only = exportBody();

  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const first = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(withCapabilities) });
    assert.equal(first.status, 200);

    const second = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v1Only) });
    assert.equal(second.status, 200);
  });

  const lines = readFileSync(join(capturesDir, "changes.jsonl"), "utf8").trim().split("\n");
  const diffed = JSON.parse(lines[1]);

  assert.deepEqual(diffed.changed.capabilities, []);

  rmSync(capturesDir, { recursive: true, force: true });
});

test("regression: two v2 syncs that both carry every v2 bucket diff cleanly instead of crashing the listener (bothSidesDefined was undefined)", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  const before = v2ExportBody();
  const after = v2ExportBody({
    componentSets: [{ key: "set-hero", name: "HeroText", description: "Updated hero block." }],
    latentCapabilities: [{ id: "cap-1", name: "has-background", visible: false, binding: "color/surface/raised" }],
  });

  let first, second;
  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    first = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(before) });
    second = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(after) });
  });

  // The bug crashed the listener process itself on the second POST (every v2
  // bucket is defined on both sides, so every bothSidesDefined() call site
  // was reached) — a dead socket, not a clean HTTP response. Asserting 200
  // on both proves the process survived, not just that a handler returned.
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  const lines = readFileSync(join(capturesDir, "changes.jsonl"), "utf8").trim().split("\n");
  const diffed = JSON.parse(lines[1]);

  assert.deepEqual(diffed.changed.componentSets, [
    { type: "component_description_changed", key: "set-hero", name: "HeroText", old: "Marketing hero block.", new: "Updated hero block." },
  ]);
  assert.deepEqual(diffed.changed.capabilities, [
    { type: "capability_visibility_changed", id: "cap-1", name: "has-background", old: true, new: false },
  ]);
  // Buckets that didn't change between the two syncs still resolve to an
  // empty diff, not an error or a false full-removal report.
  assert.deepEqual(diffed.changed.examples, []);
  assert.deepEqual(diffed.changed.templateFrames, []);

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

test("POST /capture dedup: two syncs differing only in header.timings still count as unchanged", async () => {
  // The plugin now ships per-phase export timings in header.timings (lag
  // instrumentation, capture-figma v1.20.x) — a value that necessarily
  // differs run to run. It must be excluded from the content hash for the
  // same reason exportedAt is: it describes the sync, not the file.
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const post = (timings) =>
      fetch(`${base}/capture`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(exportBody({ header: { ...exportBody().header, timings } })),
      });

    const first = await post({ variables: 120, styles: 30, totalMs: 150 });
    assert.equal(first.status, 200);
    assert.equal((await first.json()).unchanged, false);

    const second = await post({ variables: 900, styles: 210, totalMs: 1110 });
    const body = await second.json();
    assert.equal(body.ok, true);
    assert.equal(body.unchanged, true, "a slower run of an identical file must not read as a change");
  });

  rmSync(capturesDir, { recursive: true, force: true });
});

test("POST /capture response body: conformance is reported as skipped when CONFORMANCE_MAP_PATH is unset", async () => {
  // The plugin shows design<->code drift as its own lane next to Figma
  // hygiene warnings — "not configured" has to be distinguishable from
  // "configured and clean", or an unset env reads as a passing check.
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  let body;
  await withListener({ CAPTURES_DIR: capturesDir }, async (base) => {
    const res = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportBody()) });
    body = await res.json();
  });

  assert.equal(body.conformance.skipped, true);
  assert.equal(body.conformance.ran, false);

  rmSync(capturesDir, { recursive: true, force: true });
});

test("POST /capture response body: a clean conformance run reports zero defects in both lanes", async () => {
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

  let body;
  await withListener({ CAPTURES_DIR: capturesDir, CONFORMANCE_MAP_PATH: mappingPath }, async (base) => {
    const res = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportBody()) });
    body = await res.json();
  });

  assert.equal(body.conformance.ran, true);
  assert.equal(body.conformance.skipped, false);
  assert.equal(body.conformance.value.defects, 0);
  assert.equal(body.conformance.binding.defects, 0);

  rmSync(capturesDir, { recursive: true, force: true });
  rmSync(repoRoot, { recursive: true, force: true });
});

test("POST /capture response body: binding-lane defects are counted and sampled for the plugin UI", async () => {
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
          { component: "HeroText", layer: "wrapper/Content/Title/Title", property: "textStyle", codeLocation: "src/hero.tsx", assertion: { kind: "css-class" } },
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
          variants: [{ name: "device=desktop", key: "v1", bindings: [{ layer: "wrapper/Content/Title/Title", property: "textStyle", value: "title-style1/300" }] }],
        },
      ],
    },
  };

  let body;
  await withListener({ CAPTURES_DIR: capturesDir, CONFORMANCE_MAP_PATH: mappingPath }, async (base) => {
    const res = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(componentsBody) });
    body = await res.json();
  });

  assert.equal(body.conformance.ran, true);
  assert.equal(body.conformance.binding.defects, 1);
  const sample = body.conformance.binding.samples[0];
  assert.equal(sample.type, "binding_mismatch");
  assert.match(sample.label, /HeroText/);
  assert.equal(sample.codeLocation, "src/hero.tsx");

  rmSync(capturesDir, { recursive: true, force: true });
  rmSync(repoRoot, { recursive: true, force: true });
});

test("POST /capture response body: a conformance check that throws is reported, not silently dropped", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));

  let body;
  await withListener({ CAPTURES_DIR: capturesDir, CONFORMANCE_MAP_PATH: "/nonexistent/figma-map.json" }, async (base) => {
    const res = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportBody()) });
    assert.equal(res.status, 200, "a broken mapping must never fail the capture");
    body = await res.json();
  });

  assert.equal(body.conformance.ran, false);
  assert.equal(body.conformance.skipped, false);
  assert.match(body.conformance.error, /mapping file not found/);

  rmSync(capturesDir, { recursive: true, force: true });
});

test("POST /capture response body: an unchanged sync says the conformance check wasn't re-run, not that it's unconfigured", async () => {
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

  let body;
  await withListener({ CAPTURES_DIR: capturesDir, CONFORMANCE_MAP_PATH: mappingPath }, async (base) => {
    await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportBody()) });
    const second = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportBody()) });
    body = await second.json();
  });

  assert.equal(body.unchanged, true);
  assert.equal(body.conformance.ran, false);
  assert.equal(body.conformance.skipped, false, "configured but not re-run is not the same as unconfigured");
  assert.equal(body.conformance.unchanged, true);

  rmSync(capturesDir, { recursive: true, force: true });
  rmSync(repoRoot, { recursive: true, force: true });
});

// --- Re-check invalidation (a checker fix landing between two unchanged
// syncs must not keep showing the pre-fix defect count — see
// checkFingerprint/fingerprintsMatch in capture-listener.mjs) ---

test("re-check invalidation: an unchanged document with an unchanged checker/map re-uses the cached result (no re-run)", async () => {
  // Same shape as the "unchanged sync" test above, restated here as the
  // control case for the three re-check invalidation tests below: nothing
  // relevant moved between the two syncs, so the second one skips.
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

  let body;
  await withListener({ CAPTURES_DIR: capturesDir, CONFORMANCE_MAP_PATH: mappingPath }, async (base) => {
    await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportBody()) });
    const second = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportBody()) });
    body = await second.json();
  });

  assert.equal(body.unchanged, true);
  assert.equal(body.conformance.ran, false, "nothing relevant changed — the cached result is re-used");
  assert.equal(body.conformance.unchanged, true);

  rmSync(capturesDir, { recursive: true, force: true });
  rmSync(repoRoot, { recursive: true, force: true });
});

test("re-check invalidation: a checker source edit between two unchanged syncs forces a re-run", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));
  const repoRoot = mkdtempSync(join(tmpdir(), "conformance-repo-test-"));
  const checkerDir = mkdtempSync(join(tmpdir(), "checker-source-test-"));
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
  // Scratch stand-ins for the real conformance-check.mjs/binding-check.mjs —
  // CHECKER_SOURCE_PATHS lets a test point the content-hash at files it
  // controls instead of mutating this repo's own checkers mid-run.
  const checkerA = join(checkerDir, "checker-a.mjs");
  const checkerB = join(checkerDir, "checker-b.mjs");
  writeFileSync(checkerA, "// checker v1\n", "utf8");
  writeFileSync(checkerB, "// checker v1\n", "utf8");

  const env = { CAPTURES_DIR: capturesDir, CONFORMANCE_MAP_PATH: mappingPath, CHECKER_SOURCE_PATHS: `${checkerA},${checkerB}` };

  let firstBody, secondBody;
  await withListener(env, async (base) => {
    const first = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportBody()) });
    firstBody = await first.json();

    // The "checker fix" — content changes, same file path, mid-run.
    writeFileSync(checkerA, "// checker v2 — fixed a false positive\n", "utf8");

    const second = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportBody()) });
    secondBody = await second.json();
  });

  assert.equal(firstBody.unchanged, false, "first sync always runs (no prior state)");
  assert.equal(secondBody.unchanged, true, "the document itself did not change");
  assert.equal(secondBody.conformance.ran, true, "a checker source edit must force a re-run even though the document is unchanged");
  assert.equal(secondBody.conformance.value.defects, 0);

  rmSync(capturesDir, { recursive: true, force: true });
  rmSync(repoRoot, { recursive: true, force: true });
  rmSync(checkerDir, { recursive: true, force: true });
});

test("re-check invalidation: a mapping-file edit between two unchanged syncs forces a re-run", async () => {
  const capturesDir = mkdtempSync(join(tmpdir(), "capture-listener-test-"));
  const repoRoot = mkdtempSync(join(tmpdir(), "conformance-repo-test-"));
  mkdirSync(join(repoRoot, "design"), { recursive: true });
  writeFileSync(join(repoRoot, "styles.css"), `:root {\n  --content-primary: #000000;\n  --content-secondary: #111111;\n}\n`, "utf8");
  const mappingPath = join(repoRoot, "design", "figma-map.json");
  const mappingV1 = {
    $schema: "conformance-map/v1",
    entries: { "color/content/primary": { codeLocation: "styles.css", tokenName: "--content-primary", extraction: "css-root-dark" } },
  };
  writeFileSync(mappingPath, JSON.stringify(mappingV1), "utf8");

  let firstBody, secondBody;
  await withListener({ CAPTURES_DIR: capturesDir, CONFORMANCE_MAP_PATH: mappingPath }, async (base) => {
    const first = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportBody()) });
    firstBody = await first.json();

    // The map picks up a second entry — operator wired a new token — while
    // the synced document itself doesn't change.
    const mappingV2 = {
      ...mappingV1,
      entries: {
        ...mappingV1.entries,
        "color/content/secondary": { codeLocation: "styles.css", tokenName: "--content-secondary", extraction: "css-root-dark" },
      },
    };
    writeFileSync(mappingPath, JSON.stringify(mappingV2), "utf8");

    const second = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportBody()) });
    secondBody = await second.json();
  });

  assert.equal(firstBody.unchanged, false);
  assert.equal(secondBody.unchanged, true, "the document itself did not change");
  assert.equal(secondBody.conformance.ran, true, "a mapping-file edit must force a re-run even though the document is unchanged");

  rmSync(capturesDir, { recursive: true, force: true });
  rmSync(repoRoot, { recursive: true, force: true });
});

test("re-check invalidation: a listener restart between two unchanged syncs forces a re-run", async () => {
  // Two separate listener processes sharing one CAPTURES_DIR/.state sidecar —
  // the fingerprint persists to disk, so the second (freshly-started)
  // process's own PROCESS_STARTED_AT differs from the cached one and forces
  // a re-run even though nothing about the document, checker, or map moved.
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

  const env = { CAPTURES_DIR: capturesDir, CONFORMANCE_MAP_PATH: mappingPath };

  let firstBody;
  await withListener(env, async (base) => {
    const first = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportBody()) });
    firstBody = await first.json();
  });

  let secondBody;
  await withListener(env, async (base) => {
    const second = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportBody()) });
    secondBody = await second.json();
  });

  assert.equal(firstBody.unchanged, false);
  assert.equal(secondBody.unchanged, true, "the document itself did not change");
  assert.equal(secondBody.conformance.ran, true, "a listener restart must force a re-run even though the document is unchanged");

  rmSync(capturesDir, { recursive: true, force: true });
  rmSync(repoRoot, { recursive: true, force: true });
});
