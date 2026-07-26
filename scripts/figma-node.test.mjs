// Tests for figma-node.mjs — vertical slices, one behavior per test.
// Run: node --test scripts/figma-node.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeNodeId,
  parseNodeRef,
  pruneNode,
  figmaGet,
  fetchNode,
  FigmaApiError,
  fetchImageUrl,
  downloadImage,
  pngDimensions,
  defaultImagePath,
  fetchVariables,
  EnterpriseGatedError,
  parseCliArgs,
} from "./figma-node.mjs";
import { homedir } from "node:os";
import { join } from "node:path";

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  };
}

test("normalizeNodeId converts dash form to colon form", () => {
  assert.equal(normalizeNodeId("572-46329"), "572:46329");
});

test("normalizeNodeId passes colon form through unchanged", () => {
  assert.equal(normalizeNodeId("572:46329"), "572:46329");
});

test("parseNodeRef reads fileKey and nodeId from two positional args", () => {
  assert.deepEqual(parseNodeRef(["5BOmYl8F3iR5dJ84UyYK7e", "572-46329"]), {
    fileKey: "5BOmYl8F3iR5dJ84UyYK7e",
    nodeId: "572:46329",
  });
});

test("parseNodeRef extracts fileKey and nodeId from a full figma.com URL", () => {
  const url =
    "https://www.figma.com/design/5BOmYl8F3iR5dJ84UyYK7e/JHD-CaseStudy-Yardsale?node-id=572-46329&t=abc123";
  assert.deepEqual(parseNodeRef([url]), {
    fileKey: "5BOmYl8F3iR5dJ84UyYK7e",
    nodeId: "572:46329",
  });
});

test("parseNodeRef extracts a percent-encoded colon node-id from a URL", () => {
  const url = "https://www.figma.com/file/5BOmYl8F3iR5dJ84UyYK7e/Name?node-id=572%3A46329";
  assert.deepEqual(parseNodeRef([url]), {
    fileKey: "5BOmYl8F3iR5dJ84UyYK7e",
    nodeId: "572:46329",
  });
});

test("parseNodeRef throws a clear error on insufficient args", () => {
  assert.throws(() => parseNodeRef(["onlyOneArg"]), /expected/);
});

test("pruneNode strips vector geometry but keeps structure, names, bound variables, styles, layout props, and absoluteBoundingBox", () => {
  const node = {
    name: "Icon/Star",
    type: "VECTOR",
    vectorNetwork: { vertices: [1, 2, 3], segments: [] },
    vectorPaths: [{ windingRule: "NONZERO", data: "M0 0L1 1" }],
    fillGeometry: [{ path: "M0 0", windingRule: "NONZERO" }],
    strokeGeometry: [{ path: "M0 0", windingRule: "NONZERO" }],
    absoluteBoundingBox: { x: 10, y: 20, width: 24, height: 24 },
    layoutMode: "VERTICAL",
    itemSpacing: 8,
    styles: { fill: "1:2" },
    boundVariables: { itemSpacing: { type: "VARIABLE_ALIAS", id: "VariableID:1:1" } },
    children: [
      {
        name: "child",
        type: "VECTOR",
        vectorNetwork: { vertices: [], segments: [] },
        absoluteBoundingBox: { x: 0, y: 0, width: 1, height: 1 },
      },
    ],
  };

  const pruned = pruneNode(node, false);

  assert.equal(pruned.vectorNetwork, undefined);
  assert.equal(pruned.vectorPaths, undefined);
  assert.equal(pruned.fillGeometry, undefined);
  assert.equal(pruned.strokeGeometry, undefined);
  assert.equal(pruned.children[0].vectorNetwork, undefined);
  assert.equal(pruned.name, "Icon/Star");
  assert.deepEqual(pruned.absoluteBoundingBox, { x: 10, y: 20, width: 24, height: 24 });
  assert.equal(pruned.layoutMode, "VERTICAL");
  assert.equal(pruned.itemSpacing, 8);
  assert.deepEqual(pruned.styles, { fill: "1:2" });
  assert.deepEqual(pruned.boundVariables, { itemSpacing: { type: "VARIABLE_ALIAS", id: "VariableID:1:1" } });
});

test("pruneNode with raw=true returns the node unchanged, geometry included", () => {
  const node = { name: "Icon/Star", vectorNetwork: { vertices: [1] } };
  const pruned = pruneNode(node, true);
  assert.deepEqual(pruned, node);
});

test("figmaGet sends the token as X-Figma-Token and returns the response on success", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return jsonResponse(200, { ok: true });
  };

  const res = await figmaGet("/files/ABC/nodes?ids=1:1", "tok123", { fetchImpl });

  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.figma.com/v1/files/ABC/nodes?ids=1:1");
  assert.equal(calls[0].opts.headers["X-Figma-Token"], "tok123");
});

test("figmaGet retries once on 429, waiting the Retry-After header duration", async () => {
  const calls = [];
  const sleeps = [];
  let call = 0;
  const fetchImpl = async (url) => {
    calls.push(url);
    call += 1;
    if (call === 1) return jsonResponse(429, { err: "rate limited" }, { "retry-after": "7" });
    return jsonResponse(200, { ok: true });
  };
  const sleepImpl = async (ms) => sleeps.push(ms);

  const res = await figmaGet("/files/ABC", "tok123", { fetchImpl, sleepImpl });

  assert.equal(res.status, 200);
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [7000]);
});

test("figmaGet falls back to a 2s wait on 429 when Retry-After is absent, and does not retry twice", async () => {
  const sleeps = [];
  let call = 0;
  const fetchImpl = async () => {
    call += 1;
    return jsonResponse(429, { err: "rate limited" });
  };
  const sleepImpl = async (ms) => sleeps.push(ms);

  const res = await figmaGet("/files/ABC", "tok123", { fetchImpl, sleepImpl });

  assert.equal(res.status, 429);
  assert.equal(call, 2);
  assert.deepEqual(sleeps, [2000]);
});

test("fetchNode returns the pruned node entry for the requested id", async () => {
  const fetchImpl = async (url) => {
    assert.equal(url, "https://api.figma.com/v1/files/ABC/nodes?ids=572%3A46329");
    return jsonResponse(200, {
      nodes: {
        "572:46329": {
          document: { name: "Frame", vectorNetwork: { vertices: [1] }, absoluteBoundingBox: { width: 10, height: 10 } },
        },
      },
    });
  };

  const result = await fetchNode("ABC", "572:46329", "tok", { fetchImpl });

  assert.equal(result.document.name, "Frame");
  assert.equal(result.document.vectorNetwork, undefined);
  assert.deepEqual(result.document.absoluteBoundingBox, { width: 10, height: 10 });
});

test("fetchNode with raw:true keeps vector geometry", async () => {
  const fetchImpl = async () =>
    jsonResponse(200, { nodes: { "1:1": { document: { name: "Frame", vectorNetwork: { vertices: [1] } } } } });

  const result = await fetchNode("ABC", "1:1", "tok", { fetchImpl, raw: true });

  assert.deepEqual(result.document.vectorNetwork, { vertices: [1] });
});

test("fetchNode throws a clear FigmaApiError on 404", async () => {
  const fetchImpl = async () => jsonResponse(404, { err: "not found" });

  await assert.rejects(
    () => fetchNode("ABC", "1:1", "tok", { fetchImpl }),
    (err) => {
      assert.ok(err instanceof FigmaApiError);
      assert.equal(err.status, 404);
      assert.match(err.message, /404/);
      return true;
    }
  );
});

test("fetchNode throws when the response has no entry for the requested id", async () => {
  const fetchImpl = async () => jsonResponse(200, { nodes: {} });

  await assert.rejects(
    () => fetchNode("ABC", "1:1", "tok", { fetchImpl }),
    (err) => {
      assert.ok(err instanceof FigmaApiError);
      assert.match(err.message, /1:1/);
      return true;
    }
  );
});

test("fetchImageUrl requests a PNG at the given scale and returns the rendered URL", async () => {
  const fetchImpl = async (url) => {
    assert.equal(url, "https://api.figma.com/v1/images/ABC?ids=572%3A46329&format=png&scale=2");
    return jsonResponse(200, { err: null, images: { "572:46329": "https://s3.example/render.png" } });
  };

  const url = await fetchImageUrl("ABC", "572:46329", "tok", { fetchImpl, scale: 2 });

  assert.equal(url, "https://s3.example/render.png");
});

test("fetchImageUrl throws a FigmaApiError when Figma's own render fails (body.err set)", async () => {
  const fetchImpl = async () => jsonResponse(200, { err: "internal render error", images: {} });

  await assert.rejects(
    () => fetchImageUrl("ABC", "1:1", "tok", { fetchImpl }),
    (err) => {
      assert.ok(err instanceof FigmaApiError);
      assert.match(err.message, /internal render error/);
      return true;
    }
  );
});

test("downloadImage fetches the render URL and returns a Buffer of the bytes", async () => {
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const fetchImpl = async (url) => {
    assert.equal(url, "https://s3.example/render.png");
    return { ok: true, status: 200, statusText: "OK", arrayBuffer: async () => bytes.buffer };
  };

  const buffer = await downloadImage("https://s3.example/render.png", { fetchImpl });

  assert.ok(Buffer.isBuffer(buffer));
  assert.deepEqual([...buffer], [137, 80, 78, 71]);
});

test("pngDimensions reads width/height from a PNG's IHDR chunk", () => {
  // Minimal valid PNG header: signature + IHDR chunk declaring 24x32.
  const buffer = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // signature
    Buffer.from([0, 0, 0, 13]), // IHDR length
    Buffer.from("IHDR", "ascii"),
    Buffer.from([0, 0, 0, 24]), // width = 24
    Buffer.from([0, 0, 0, 32]), // height = 32
  ]);

  assert.deepEqual(pngDimensions(buffer), { width: 24, height: 32 });
});

test("pngDimensions returns null for a buffer too short to be a PNG", () => {
  assert.equal(pngDimensions(Buffer.from([1, 2, 3])), null);
});

test("defaultImagePath builds ~/JHD/captures/renders/<key>-<dash-id>.png", () => {
  assert.equal(
    defaultImagePath("5BOmYl8F3iR5dJ84UyYK7e", "572:46329"),
    join(homedir(), "JHD", "captures", "renders", "5BOmYl8F3iR5dJ84UyYK7e-572-46329.png")
  );
});

test("fetchVariables returns the parsed body on success", async () => {
  const fetchImpl = async (url) => {
    assert.equal(url, "https://api.figma.com/v1/files/ABC/variables/local");
    return jsonResponse(200, { meta: { variables: {} } });
  };

  const body = await fetchVariables("ABC", "tok", { fetchImpl });

  assert.deepEqual(body, { meta: { variables: {} } });
});

test("fetchVariables throws EnterpriseGatedError (never fakes a result) on 403", async () => {
  const fetchImpl = async () => jsonResponse(403, { err: "Forbidden" });

  await assert.rejects(
    () => fetchVariables("ABC", "tok", { fetchImpl }),
    (err) => {
      assert.ok(err instanceof EnterpriseGatedError);
      assert.match(err.message, /Enterprise/);
      assert.match(err.message, /ABC/);
      return true;
    }
  );
});

test("parseCliArgs keeps all positional args when no value-flag is present (regression: indexOf(-1)+1 must not eat arg 0)", () => {
  const { positional, flags } = parseCliArgs(["fileKeyABC", "572:46329"], { valueFlags: ["--out"], boolFlags: ["--raw"] });
  assert.deepEqual(positional, ["fileKeyABC", "572:46329"]);
  assert.deepEqual(flags, {});
});

test("parseCliArgs extracts a value-flag and a bool-flag from among positional args", () => {
  const { positional, flags } = parseCliArgs(["fileKeyABC", "1:1", "--raw", "--out", "/tmp/x.json"], {
    valueFlags: ["--out"],
    boolFlags: ["--raw"],
  });
  assert.deepEqual(positional, ["fileKeyABC", "1:1"]);
  assert.deepEqual(flags, { "--raw": true, "--out": "/tmp/x.json" });
});
