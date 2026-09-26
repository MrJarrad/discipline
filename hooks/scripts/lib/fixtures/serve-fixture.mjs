#!/usr/bin/env node
// Serves media-load-probe-fixture.html as a live URL on a 3240+ port — the
// probe drives a real URL, never a file:// path.
//
// Usage: node serve-fixture.mjs [port]   (default 3241)
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(dir, "media-load-probe-fixture.html"));
const port = Number(process.argv[2] || 3241);

const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
});

server.listen(port, () => {
  console.log(`media-load-probe fixture serving on http://localhost:${port}`);
});
