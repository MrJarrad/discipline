// vocabulary-index — the "what we already have" lookup (vocabulary lock,
// 2026-09-27, items 1/4/5/6).
// Run: node --test hooks/scripts/vocabulary-index.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseTokensCss,
  parseUnionType,
  parseIndexExports,
  parseComponentExports,
  parseMotionPropsTable,
  parseProductComponents,
  parseFigmaCodeSyntax,
  diffFigmaCode,
  collectFeatureNames,
  namingRuleReport,
  buildIndex,
  queryIndex,
} from "./vocabulary-index.mjs";

const scriptPath = fileURLToPath(new URL("./vocabulary-index.mjs", import.meta.url));

// --- parseTokensCss --------------------------------------------------

test("parseTokensCss reads the resolved value from the trailing comment", () => {
  const css = `:root {\n  --dimension-button-height: var(--dimension-900); /* 1.75rem */\n}\n`;
  const rows = parseTokensCss(css, "tokens.generated.css");
  assert.deepEqual(rows, [{ name: "--dimension-button-height", value: "1.75rem", source: "tokens.generated.css" }]);
});

test("parseTokensCss falls back to the raw value when no comment exists", () => {
  const css = `:root {\n  --space-4: 8px;\n}\n`;
  const rows = parseTokensCss(css, "src");
  assert.equal(rows[0].value, "8px");
});

// --- parseUnionType ----------------------------------------------------

test("parseUnionType reads a single-line literal union's values in order", () => {
  const src = `export type ActionLayout = "primary" | "secondary" | "tertiary"\n`;
  assert.deepEqual(parseUnionType(src, "ActionLayout"), ["primary", "secondary", "tertiary"]);
});

test("parseUnionType returns [] when the type name isn't found", () => {
  assert.deepEqual(parseUnionType(`export type X = "a"`, "Y"), []);
});

// --- parseIndexExports ---------------------------------------------------

test("parseIndexExports reads a single-line barrel export", () => {
  const idx = `export { Badge, type BadgeVariant } from "./badge"\n`;
  assert.deepEqual(parseIndexExports(idx), [{ component: "Badge", file: "badge", propTypes: ["BadgeVariant"] }]);
});

test("parseIndexExports reads a multi-line barrel export block", () => {
  const idx = `export {\n  ActionButtonSwitch,\n  type ActionButtonSwitchLayout,\n  type ActionButtonSwitchSize,\n} from "./action-button-switch"\n`;
  const rows = parseIndexExports(idx);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].component, "ActionButtonSwitch");
  assert.deepEqual(rows[0].propTypes, ["ActionButtonSwitchLayout", "ActionButtonSwitchSize"]);
});

// --- parseComponentExports ------------------------------------------------

test("parseComponentExports resolves each prop type's values via its own file, stripping the component-name prefix", () => {
  const indexTs = `export { Action, type ActionLayout, type ActionSize } from "./action"\n`;
  const files = {
    "src/action.tsx": `export type ActionLayout = "primary" | "secondary" | "tertiary"\nexport type ActionSize = "100" | "200" | "300"\n`,
  };
  const { components, props } = parseComponentExports(indexTs, (rel) => files[rel] || null, "ds-root");
  assert.deepEqual(components, [{ name: "Action", source: "ds-root/src/action.tsx", repo: "design-system" }]);
  assert.deepEqual(props, [
    { component: "Action", prop: "layout", typeName: "ActionLayout", values: ["primary", "secondary", "tertiary"], source: "ds-root/src/action.tsx" },
    { component: "Action", prop: "size", typeName: "ActionSize", values: ["100", "200", "300"], source: "ds-root/src/action.tsx" },
  ]);
});

// --- parseMotionPropsTable ------------------------------------------------

const MOTION_LAW_FIXTURE = `# House motion law

## Motion props (locked, operator ruling 2026-09-27)

| Prop | Values | Default | Sets |
| --- | --- | --- | --- |
| \`trigger\` | \`load\` \\| \`navigate\` \\| \`in-view\` \\| \`interact\` (open, e.g. \`idle\`) | \`load\` | which page clock an element rides |
| \`entry\` | \`stagger\` \\| \`together\` | \`together\` | whether siblings reveal one at a time or on one tick |

## Next section
not a table row
`;

test("parseMotionPropsTable reads the locked table's closed value set and default, flagging open rows", () => {
  const rows = parseMotionPropsTable(MOTION_LAW_FIXTURE, "motion-law.md");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    prop: "trigger",
    values: ["load", "navigate", "in-view", "interact"],
    open: true,
    default: "load",
    source: "motion-law.md",
  });
  assert.deepEqual(rows[1], {
    prop: "entry",
    values: ["stagger", "together"],
    open: false,
    default: "together",
    source: "motion-law.md",
  });
});

test("parseMotionPropsTable stops at the next heading", () => {
  const rows = parseMotionPropsTable(MOTION_LAW_FIXTURE, "motion-law.md");
  assert.equal(rows.some((r) => r.prop === "not"), false);
});

// --- parseProductComponents -----------------------------------------------

test("parseProductComponents scans a flat directory, skipping .test.tsx", () => {
  const files = {
    "card-media.tsx": `export function CardMediaHeader({}) {}\nexport function CardMedia({}) {}\n`,
    "card-media.test.tsx": `export function CardMedia() {}\n`,
    "not-a-component.md": `export function Nope() {}`,
  };
  const rows = parseProductComponents(Object.keys(files), (f) => files[f], "portfolio/src/components");
  assert.deepEqual(rows, [
    { name: "CardMediaHeader", source: "portfolio/src/components/card-media.tsx", repo: "portfolio" },
    { name: "CardMedia", source: "portfolio/src/components/card-media.tsx", repo: "portfolio" },
  ]);
});

// --- Figma <-> code name check --------------------------------------------

test("parseFigmaCodeSyntax reads the WEB codeSyntax binding off every collection's variables", () => {
  const handoff = {
    collections: [
      {
        variables: [
          { name: "family/font-sans", codeSyntax: { WEB: { value: "--family-font-sans", source: "derived" } } },
          { name: "no-web-binding", codeSyntax: { iOS: { value: "x" } } },
        ],
      },
    ],
  };
  assert.deepEqual(parseFigmaCodeSyntax(handoff), [{ figmaName: "family/font-sans", webVar: "--family-font-sans", source: "derived" }]);
});

test("diffFigmaCode flags a Figma variable whose expected CSS var is absent from tokens.generated.css", () => {
  const figmaRows = [
    { figmaName: "family/font-sans", webVar: "--family-font-sans" },
    { figmaName: "family/font-mono", webVar: "--family-font-mono" },
  ];
  const cssVarNames = ["--family-font-sans"];
  assert.deepEqual(diffFigmaCode(figmaRows, cssVarNames), [
    { figmaName: "family/font-mono", expectedWebVar: "--family-font-mono", status: "missing-in-css" },
  ]);
});

test("diffFigmaCode returns [] when every Figma variable's expected var is present", () => {
  const figmaRows = [{ figmaName: "family/font-sans", webVar: "--family-font-sans" }];
  assert.deepEqual(diffFigmaCode(figmaRows, ["--family-font-sans"]), []);
});

// --- naming-rule report ------------------------------------------------

test("collectFeatureNames derives kebab-case basenames from component source paths", () => {
  const names = collectFeatureNames(["ds/src/action.tsx", "portfolio/src/components/gallery-project-hover.tsx"]);
  assert.equal(names.has("action"), true);
  assert.equal(names.has("gallery-project-hover"), true);
});

test("namingRuleReport flags a prop value that exact-matches a feature (component/page) name", () => {
  const rows = [{ component: "Nav", prop: "variant", values: ["gallery", "primary"], source: "nav.tsx" }];
  const featureNames = new Set(["gallery-project-hover", "gallery"]);
  const flagged = namingRuleReport(rows, featureNames);
  assert.deepEqual(flagged, [{ component: "Nav", prop: "variant", value: "gallery", matchesFeature: "gallery", source: "nav.tsx" }]);
});

test("namingRuleReport is silent on a value with no feature-name collision", () => {
  assert.deepEqual(namingRuleReport([{ prop: "effect", values: ["fade", "rise"], source: "x" }], new Set(["nav-header"])), []);
});

// --- buildIndex (fixture repo on disk) ------------------------------------

function makeFixtureRepos() {
  const root = mkdtempSync(join(tmpdir(), "vocab-index-"));
  const dsRoot = join(root, "ds");
  const portfolioRoot = join(root, "portfolio");
  mkdirSync(join(dsRoot, "src"), { recursive: true });
  mkdirSync(join(portfolioRoot, "src", "components"), { recursive: true });

  writeFileSync(
    join(dsRoot, "src", "tokens.generated.css"),
    `:root {\n  --dimension-button-height: var(--dimension-900); /* 1.75rem */\n}\n`,
  );
  writeFileSync(join(dsRoot, "src", "index.ts"), `export { Action, type ActionLayout } from "./action"\n`);
  writeFileSync(join(dsRoot, "src", "action.tsx"), `export type ActionLayout = "primary" | "secondary" | "tertiary"\n`);
  writeFileSync(
    join(dsRoot, "motion-law.md"),
    `## Motion props (locked, operator ruling 2026-09-27)\n\n| Prop | Values | Default | Sets |\n| --- | --- | --- | --- |\n| \`entry\` | \`stagger\` \\| \`together\` | \`together\` | slot reveal |\n`,
  );

  writeFileSync(
    join(portfolioRoot, "src", "components", "footer.tsx"),
    `export function Footer({}) {}\n`,
  );

  const handoffDir = join(dsRoot, "design", "handoff", "latest");
  mkdirSync(handoffDir, { recursive: true });
  writeFileSync(
    join(handoffDir, "jhd-spec-designsystem-design-system-handoff.json"),
    JSON.stringify({
      collections: [
        {
          variables: [
            { name: "dimension/button-height", codeSyntax: { WEB: { value: "--dimension-button-height", source: "derived" } } },
            { name: "dimension/gap-missing", codeSyntax: { WEB: { value: "--dimension-gap-missing", source: "derived" } } },
          ],
        },
      ],
    }),
  );

  return { root, dsRoot, portfolioRoot };
}

test("buildIndex assembles tokens, components, props, motionProps, and figmaMismatches from real files on disk", () => {
  const { root, dsRoot, portfolioRoot } = makeFixtureRepos();
  try {
    const index = buildIndex({ dsRoot, portfolioRoot, generatedAt: "2026-09-27T00:00:00.000Z" });
    assert.equal(index.tokens.length, 1);
    assert.equal(index.tokens[0].name, "--dimension-button-height");
    assert.equal(index.components.length, 2); // Action (DS) + Footer (portfolio)
    assert.equal(index.props.length, 1);
    assert.equal(index.props[0].component, "Action");
    assert.equal(index.motionProps.length, 1);
    assert.equal(index.motionProps[0].prop, "entry");
    assert.deepEqual(index.figmaMismatches, [
      { figmaName: "dimension/gap-missing", expectedWebVar: "--dimension-gap-missing", status: "missing-in-css" },
    ]);
    assert.deepEqual(index.counts, {
      tokens: 1,
      components: 2,
      props: 1,
      motionProps: 1,
      figmaMismatches: 1,
      namingReport: 0,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("buildIndex flags a naming-rule row when a prop value matches an actual component/page basename", () => {
  const { root, dsRoot, portfolioRoot } = makeFixtureRepos();
  try {
    writeFileSync(join(dsRoot, "src", "index.ts"), `export { Action, type ActionLayout } from "./action"\n`);
    writeFileSync(join(dsRoot, "src", "action.tsx"), `export type ActionLayout = "primary" | "footer"\n`);
    const index = buildIndex({ dsRoot, portfolioRoot, generatedAt: "2026-09-27T00:00:00.000Z" });
    assert.equal(index.namingReport.length, 1);
    assert.equal(index.namingReport[0].value, "footer");
    assert.equal(index.namingReport[0].matchesFeature, "footer");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("buildIndex tolerates a missing DS or portfolio root (empty rows, no throw)", () => {
  const index = buildIndex({});
  assert.deepEqual(index.tokens, []);
  assert.deepEqual(index.components, []);
  assert.deepEqual(index.figmaMismatches, []);
});

// --- queryIndex ------------------------------------------------------

test("queryIndex matches tokens, components, props, and motion props by substring, case-insensitively", () => {
  const index = {
    tokens: [{ name: "--duration-500", value: "500ms", source: "x" }],
    components: [{ name: "Footer", source: "x", repo: "portfolio" }],
    props: [{ component: "Action", prop: "layout", typeName: "ActionLayout", values: ["primary"], source: "x" }],
    motionProps: [{ prop: "entry", values: ["stagger", "together"], default: "together", source: "x" }],
  };
  assert.equal(queryIndex(index, "FOOTER").length, 1);
  assert.equal(queryIndex(index, "duration").length, 1);
  assert.equal(queryIndex(index, "stagger").length, 1);
  assert.equal(queryIndex(index, "primary").length, 1);
  assert.equal(queryIndex(index, "nonexistent-term").length, 0);
});

test("queryIndex matches on CATEGORY, not just row fields — a category term with no field hit still returns that category's rows", () => {
  const index = {
    tokens: [{ name: "--duration-500", value: "500ms", source: "tokens.generated.css" }],
    components: [{ name: "Footer", source: "footer.tsx", repo: "portfolio" }],
    props: [{ component: "Action", prop: "layout", typeName: "ActionLayout", values: ["primary"], source: "action.tsx" }],
    motionProps: [
      { prop: "entry", values: ["stagger", "together"], default: "together", source: "motion-law.md" },
      { prop: "trigger", values: ["load", "navigate"], default: "load", source: "motion-law.md" },
    ],
  };
  // "motion" appears in none of the motionProps rows' own prop/value fields,
  // only in the "motion-prop" kind label and the motion-law.md source —
  // round 2 review red: this returned 0 before the category/source match.
  const motionHits = queryIndex(index, "motion");
  assert.equal(motionHits.length, 2);
  assert.ok(motionHits.every((h) => h.kind === "motion-prop"));

  assert.equal(queryIndex(index, "token").length, 1);
  assert.equal(queryIndex(index, "component").length, 1);
});

// --- CLI smoke test --------------------------------------------------

test("CLI build writes an index file and query finds a row in it", () => {
  const { root, dsRoot, portfolioRoot } = makeFixtureRepos();
  const outPath = join(root, "index.json");
  try {
    const buildOut = execFileSync("node", [scriptPath, "build", "--ds", dsRoot, "--portfolio", portfolioRoot, "--out", outPath], {
      encoding: "utf8",
    });
    assert.match(buildOut, /vocabulary-index: wrote/);
    const queryOut = execFileSync("node", [scriptPath, "query", "entry", "--index", outPath], { encoding: "utf8" });
    assert.match(queryOut, /"kind":"motion-prop"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
