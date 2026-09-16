// `capture-website/scripts/capture-motion.mjs` builds three browser snippets as
// template-literal strings and hands them to Playwright's `page.evaluate`. Two
// of them were broken on the daniellanzrath.de capture (2026-09-13) and the bug
// class is invisible to `node --check`, because the snippets are strings to the
// module that declares them — only the browser ever parses them:
//
//   1. `SAMPLE_GSAP_FN` opened `(trigger) => {` and closed `})`, so the call
//      site `${SAMPLE_GSAP_FN}('load')` produced unbalanced parens and threw a
//      SyntaxError inside the page — every GSAP sample silently lost.
//   2. `DETECT_ENV_FN` was passed to `page.evaluate` as a bare string. Playwright
//      evaluates a string as an EXPRESSION, so it returned the function rather
//      than calling it, and `motion-environment.json` was written from a value
//      that had never run.
//
// This test parses what the browser would parse: each snippet is spliced into
// its real call form and compiled with `new vm.Script`. A snippet that cannot
// be compiled as an expression fails here rather than at capture time.
// Run: node --test hooks/scripts/capture-motion-script.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const scriptPath = join(repo, "skills", "capture-website", "scripts", "capture-motion.mjs");
const source = readFileSync(scriptPath, "utf8");

// The raw body of `const <NAME> = \`...\`;` — the string as the module builds it,
// with the module's own `\\s` escapes collapsed the way the template would.
const snippet = (name) => {
  const start = source.indexOf(`const ${name} = \``);
  assert.notEqual(start, -1, `${name} is not declared in capture-motion.mjs`);
  const open = source.indexOf("`", start);
  const close = source.indexOf("`;", open + 1);
  assert.notEqual(close, -1, `${name}'s template literal is not terminated`);
  return source.slice(open + 1, close).replace(/\\\\/g, "\\");
};

const compiles = (code, label) => {
  assert.doesNotThrow(() => new vm.Script(`(${code})`), (err) => err, label);
};

test("every evaluated snippet compiles as a JavaScript expression", () => {
  for (const name of ["SAMPLE_CSS_FN", "SAMPLE_GSAP_FN", "DETECT_ENV_FN"]) {
    compiles(snippet(name), `${name} does not compile`);
  }
});

test("SAMPLE_GSAP_FN is call-ready at its call sites — balanced, not `(trigger) => {…})`", () => {
  const gsap = snippet("SAMPLE_GSAP_FN");
  assert.ok(gsap.startsWith("(("), "SAMPLE_GSAP_FN must open with its own wrapping paren");
  // The exact shape the module interpolates: `${SAMPLE_GSAP_FN}('load')`.
  assert.doesNotThrow(
    () => new vm.Script(`${gsap}('load')`),
    "`${SAMPLE_GSAP_FN}('load')` is not parseable — the wrapping paren is missing",
  );
});

test("SAMPLE_CSS_FN stays call-ready too (the shape GSAP was measured against)", () => {
  assert.doesNotThrow(() => new vm.Script(`${snippet("SAMPLE_CSS_FN")}(1500, 16, 'load')`));
});

test("DETECT_ENV_FN is invoked, not handed to page.evaluate as a value", () => {
  assert.match(
    source,
    /page\.evaluate\(`\(\$\{DETECT_ENV_FN\}\)\(\)`\)/,
    "DETECT_ENV_FN must be evaluated as `(${DETECT_ENV_FN})()` — a bare string returns the function, never its result",
  );
  assert.doesNotMatch(
    source,
    /page\.evaluate\(DETECT_ENV_FN\)/,
    "page.evaluate(DETECT_ENV_FN) evaluates the expression without calling it",
  );
});

test("the detector actually returns the fields the capture writes out", () => {
  const detect = new vm.Script(`(${snippet("DETECT_ENV_FN")})()`);
  const context = vm.createContext({
    document: { querySelector: () => null },
    globalThis: {},
  });
  const env = detect.runInContext(context);
  for (const key of ["canvasPresent", "tapeRequired", "motionConstruction"]) {
    assert.ok(key in env, `motion-environment.json reads ${key}, which the detector did not return`);
  }
  assert.equal(env.motionConstruction, "css", "no canvas and no gsap is a CSS-construction page");
});
