// DISC-299 / DISC-303 (s81): after each discipline release the parent proposes bumping the Default environment's setup-script
// refresh line (one operator approval per release), because the cloud image caches the plugin as of the script's last change (DISC-298).
// Run: node --test hooks/scripts/setup-refresh-line.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bumpRefreshLine } from "./setup-refresh-line.mjs";

const script = fileURLToPath(new URL("./setup-refresh-line.mjs", import.meta.url));
const BODY = "mkdir -p ~/.claude\nclaude plugin marketplace update discipline && claude plugin update discipline@discipline\n";

test("an existing first-line refresh marker is replaced with the new date and release", () => {
  const r = bumpRefreshLine(`# plugin refresh 2026-11-12\n${BODY}`, "2026-11-20", "1.200.0");
  assert.equal(r.script, `# plugin refresh 2026-11-20 (discipline 1.200.0)\n${BODY}`);
  assert.equal(r.changed, true);
});
test("a script with no marker gets one added as its first line, the rest untouched", () => {
  assert.equal(bumpRefreshLine(BODY, "2026-11-12").script, `# plugin refresh 2026-11-12\n${BODY}`);
});
test("the same date and release again changes nothing (idempotent)", () => {
  const once = bumpRefreshLine(BODY, "2026-11-20", "1.200.0").script;
  const twice = bumpRefreshLine(once, "2026-11-20", "1.200.0");
  assert.equal(twice.script, once); assert.equal(twice.changed, false);
});
test("a marker that is not the first line is left alone and a new first line is added", () => {
  const s = `${BODY}# plugin refresh 2026-01-01\n`;
  assert.ok(bumpRefreshLine(s, "2026-11-20").script.startsWith("# plugin refresh 2026-11-20\n" + BODY));
});
test("a bad date is refused", () => {
  assert.throws(() => bumpRefreshLine(BODY, "yesterday"), /date/);
});
test("CLI reads the script on stdin and prints the new script; --line prints only the line to propose", () => {
  const r = spawnSync(process.execPath, [script, "--date", "2026-11-20", "--release", "1.200.0", "--line"], { input: BODY, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "# plugin refresh 2026-11-20 (discipline 1.200.0)\n");
});
