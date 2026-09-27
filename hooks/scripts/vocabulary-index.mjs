#!/usr/bin/env node
/* vocabulary-index — the "what we already have" lookup (vocabulary lock,
   2026-09-27, items 1/4/5/6). One script builds one index from the sources
   that already carry the system's real names — the design system's
   generated tokens, its component prop unions, its motion-prop law, and a
   product repo's own components — plus a Figma <-> code name check read off
   the design-system-handoff export already vendored under
   `design/handoff/latest`. Nothing here calls an agent: every row is a
   grep/parse of a file already on disk.

   Regeneration hook: `ds-regen.mjs`, opt-in via `--vocab-out <path>` — the
   step that already runs "whenever the DS changes" (a fresh handoff export
   lands and passes freshness). ds-regen best-effort rebuilds the index after
   its own token regen succeeds; a failure there never fails the DS regen
   (see `runVocabIndexStep` there). Run by hand any other time:
     node vocabulary-index.mjs build --ds <DS repo> --portfolio <product repo>
       [--motion-law <path>] [--handoff <handoff export dir>] --out <json path>
     node vocabulary-index.mjs query <term> --index <json path>

   Pure logic exported for testing:
     parseTokensCss, parseUnionType, parseIndexExports, parseComponentExports,
     parseMotionPropsTable, parseFigmaCodeSyntax, diffFigmaCode,
     collectFeatureNames, namingRuleReport, buildIndex, queryIndex. */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

// --- tokens.generated.css ---------------------------------------------

/* `--var-name: value; /* 1.75rem *\/` -> [{ name: "--var-name", value: "1.75rem" }]
   Prefers the trailing comment's resolved value (what tokens.generated.css
   annotates every alias with); falls back to the raw declaration when no
   comment is present. */
export function parseTokensCss(css, sourceLabel) {
  const rows = [];
  const re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);(?:\s*\/\*\s*([^*]+?)\s*\*\/)?/g;
  let m;
  while ((m = re.exec(css))) {
    const [, name, rawValue, comment] = m;
    rows.push({ name, value: (comment || rawValue).trim(), source: sourceLabel });
  }
  return rows;
}

// --- component prop unions (DS `export type X = "a" | "b"`) -----------

/* Extracts the quoted literal values of a single-line
   `export type <typeName> = "a" | "b" | ...` declaration. Returns [] when
   the type isn't found or isn't a literal union (e.g. it aliases another
   type — those carry no values of their own to index). */
export function parseUnionType(source, typeName) {
  const re = new RegExp(`export type ${typeName}\\s*=\\s*([^\\n]+)`);
  const m = re.exec(source);
  if (!m) return [];
  const values = [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
  return values;
}

/* Parses a DS-shaped barrel (`src/index.ts`): one export block per
   component, naming the component and every `type X` re-exported alongside
   it. Multi-line `export { A, type B, type C } from "./file"` blocks are
   supported (the barrel wraps long lists across lines). */
export function parseIndexExports(indexTs) {
  const out = [];
  const re = /export\s*\{([^}]+)\}\s*from\s*["']\.\/([\w-]+)["']/g;
  let m;
  while ((m = re.exec(indexTs))) {
    const [, body, file] = m;
    const names = body
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const componentName = names.find((n) => !n.startsWith("type "));
    const propTypes = names.filter((n) => n.startsWith("type ")).map((n) => n.replace(/^type\s+/, ""));
    if (componentName) out.push({ component: componentName, file, propTypes });
  }
  return out;
}

/* Walks a DS-shaped repo: reads `src/index.ts` for the component/prop-type
   list, then reads each named component's own source file to resolve every
   prop type to its literal values. Returns { components, props }. */
export function parseComponentExports(indexTs, readFile, sourceLabel) {
  const entries = parseIndexExports(indexTs);
  const components = [];
  const props = [];
  for (const { component, file, propTypes } of entries) {
    const filePath = `src/${file}.tsx`;
    components.push({ name: component, source: `${sourceLabel}/${filePath}`, repo: "design-system" });
    const source = readFile(filePath);
    if (!source) continue;
    for (const typeName of propTypes) {
      const values = parseUnionType(source, typeName);
      if (values.length === 0) continue;
      // "ActionButtonSwitchLayout" -> "layout" (strip the component-name prefix).
      const propName = typeName.startsWith(component)
        ? typeName.slice(component.length).replace(/^./, (c) => c.toLowerCase())
        : typeName;
      props.push({ component, prop: propName, typeName, values, source: `${sourceLabel}/${filePath}` });
    }
  }
  return { components, props };
}

// --- motion props (motion-law.md's locked table) -----------------------

/* Reads the "## Motion props (locked...)" markdown table and returns one
   row per prop: { prop, values, default, sets }. Values column strips the
   `` `x` `` \| `` `y` `` markdown and the "(open, e.g. ...)" suffix into a
   separate `open` flag/examples list, since those extra values are named
   examples, not the closed set. */
export function parseMotionPropsTable(md, sourceLabel) {
  const heading = /^##\s*Motion props/m.exec(md);
  if (!heading) return [];
  const rest = md.slice(heading.index);
  const tableStart = rest.indexOf("| Prop |");
  if (tableStart === -1) return [];
  const tableText = rest.slice(tableStart);
  // Table block = every consecutive line starting with "|" from the header
  // on — stops at the first non-"|" line (blank line, prose, or the next
  // heading), so a second table further down the document (e.g. a token-
  // rename table) is never folded in.
  const allLines = tableText.split("\n");
  const lines = [];
  for (const l of allLines) {
    if (!l.startsWith("|")) break;
    lines.push(l);
  }
  const rows = lines.slice(2); // skip header + separator
  const out = [];
  for (const line of rows) {
    // Split on unescaped `|` only — a cell's own `` `a` \| `b` `` markdown
    // (rendered as a literal pipe between values) must not be read as a
    // second column boundary.
    const cells = line
      .split(/(?<!\\)\|/)
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 4) continue;
    const [prop, valuesCell, defaultCell] = cells;
    const propName = prop.replace(/`/g, "");
    const openMatch = /\(open(?:,\s*e\.g\.\s*([^)]+))?\)/.exec(valuesCell);
    const closedCell = valuesCell.replace(/\(open[^)]*\)/, "");
    const values = [...closedCell.matchAll(/`([^`]+)`/g)].map((x) => x[1]);
    out.push({
      prop: propName,
      values,
      open: Boolean(openMatch),
      default: defaultCell.replace(/`/g, ""),
      source: sourceLabel,
    });
  }
  return out;
}

// --- product-repo components (plain function-export scan) --------------

/* Scans one flat directory of `.tsx` files (non-`.test.tsx`) for
   `export function Name(` and returns one row per component found. Product
   repos (portfolio) don't carry a DS-shaped barrel, so this reads the
   component files directly rather than an index. */
export function parseProductComponents(dirEntries, readFile, sourceLabel) {
  const components = [];
  for (const file of dirEntries) {
    if (!file.endsWith(".tsx") || file.endsWith(".test.tsx")) continue;
    const source = readFile(file);
    if (!source) continue;
    const re = /export function (\w+)\(/g;
    let m;
    while ((m = re.exec(source))) {
      components.push({ name: m[1], source: `${sourceLabel}/${file}`, repo: "portfolio" });
    }
  }
  return components;
}

// --- Figma <-> code name check ------------------------------------------

/* Reads every variable across every collection in a design-system-handoff
   export and returns { figmaName, webVar } for each one that carries a WEB
   codeSyntax binding. `figmaName` is the Figma variable's own slash-path
   name (e.g. "family/font-sans"); `webVar` is the exported `--css-var`. */
export function parseFigmaCodeSyntax(handoffJson) {
  const out = [];
  const collections = Array.isArray(handoffJson.collections) ? handoffJson.collections : [];
  for (const collection of collections) {
    for (const v of collection.variables || []) {
      const web = v.codeSyntax && v.codeSyntax.WEB;
      if (!web || !web.value) continue;
      out.push({ figmaName: v.name, webVar: web.value, source: web.source || "unknown" });
    }
  }
  return out;
}

/* Cross-references the Figma-side name list against the actual CSS var
   names in the token files. A mismatch is a Figma variable whose expected
   WEB var (`codeSyntax.WEB.value`, the name the export's own naming policy
   derives from the Figma layer name) is not defined anywhere in the token
   files — covers both a genuine rename drift (code kept an old alias after
   Figma's name moved) and a primitive Figma carries that was never
   consumed into a token (no `topConsumers`, so the generator dropped it).
   The export's `codeSyntax.WEB.source` field would separate "manual
   override" from "derived" if a mismatch were hand-fixed, but every
   variable in the current export is `derived` — so this list is the whole
   "Figma name has no matching code name" set, not yet split further; the
   operator reads it as one list (lock item 6). Matches are dropped; only
   the mismatch rows are returned. */
export function diffFigmaCode(figmaRows, cssVarNames) {
  const known = new Set(cssVarNames);
  return figmaRows
    .filter((r) => !known.has(r.webVar))
    .map((r) => ({ figmaName: r.figmaName, expectedWebVar: r.webVar, status: "missing-in-css" }));
}

// --- naming-rule report (house-wide, README "Naming rule") --------------

/* A prop/token VALUE that also names a page/component/feature is a naming-
   rule candidate (README "Naming rule (house-wide)" — a value names an
   event, a position, or a look, never a page/component/feature). Mechanical
   proxy: the set of every component/page file basename (kebab-case, no
   extension) across both repos is the "feature name" list; any indexed
   value that exact-matches one is flagged. Report only — never a gate
   (lock item 4: "the naming-rule report, not a gate"). */
export function collectFeatureNames(componentSourcePaths) {
  const names = new Set();
  for (const path of componentSourcePaths) {
    const base = basename(path, ".tsx").replace(/\.test$/, "");
    names.add(base);
  }
  return names;
}

export function namingRuleReport(rows, featureNames) {
  const flagged = [];
  for (const row of rows) {
    for (const value of row.values || []) {
      const slug = String(value).toLowerCase();
      if (featureNames.has(slug)) {
        flagged.push({ component: row.component || row.prop, prop: row.prop, value, matchesFeature: slug, source: row.source });
      }
    }
  }
  return flagged;
}

// --- build / query -------------------------------------------------------

function safeReadFile(root, rel) {
  const full = join(root, rel);
  return existsSync(full) ? readFileSync(full, "utf8") : null;
}

/* Reads the newest `jhd-spec-designsystem-design-system-handoff.json` under
   a `design/handoff/<dir>` export (the vendored `latest` symlink, or any
   version dir passed directly). Returns null when absent/unreadable — the
   Figma<->code check is then skipped, never a fatal error, so the index
   still builds tokens/components/props with no export on disk. */
function readHandoffJson(handoffDir) {
  if (!handoffDir || !existsSync(handoffDir)) return null;
  const entries = readdirSync(handoffDir);
  const jsonFile = entries.find((e) => /design-system-handoff(-[\d-]+)?\.json$/.test(e));
  if (!jsonFile) return null;
  try {
    return JSON.parse(readFileSync(join(handoffDir, jsonFile), "utf8"));
  } catch {
    return null;
  }
}

/* Builds the full index from paths on disk. `dsRoot` is a DS-shaped repo
   (`src/tokens.generated.css`, `src/index.ts`, `motion-law.md`);
   `portfolioRoot` is a product repo whose components live flat under
   `src/components`. Either root may be omitted — the corresponding rows
   are simply empty, never a thrown error, so `build --ds only` still works. */
export function buildIndex({ dsRoot, portfolioRoot, motionLawPath, handoffDir, generatedAt } = {}) {
  const tokens = [];
  const components = [];
  const props = [];
  let motionProps = [];
  let figmaMismatches = [];

  if (dsRoot) {
    const cssPath = join(dsRoot, "src/tokens.generated.css");
    if (existsSync(cssPath)) {
      tokens.push(...parseTokensCss(readFileSync(cssPath, "utf8"), `${dsRoot}/src/tokens.generated.css`));
    }
    // `tokens.generated.css`'s own header: "Hand-authored tokens in
    // styles.css always win and are omitted here" — the primitive scale
    // (--border-100, --radius-full, ...) lives there, not in the generated
    // file. Both are read so the index (and the Figma<->code known-name set
    // below) cover the whole token surface, not just the generated half.
    const handAuthoredCssPath = join(dsRoot, "src/styles.css");
    if (existsSync(handAuthoredCssPath)) {
      tokens.push(...parseTokensCss(readFileSync(handAuthoredCssPath, "utf8"), `${dsRoot}/src/styles.css`));
    }
    const indexPath = join(dsRoot, "src/index.ts");
    if (existsSync(indexPath)) {
      const parsed = parseComponentExports(readFileSync(indexPath, "utf8"), (rel) => safeReadFile(dsRoot, `src/${rel.replace(/^src\//, "")}`), dsRoot);
      components.push(...parsed.components);
      props.push(...parsed.props);
    }
    const lawPath = motionLawPath || join(dsRoot, "motion-law.md");
    if (existsSync(lawPath)) {
      motionProps = parseMotionPropsTable(readFileSync(lawPath, "utf8"), lawPath);
    }
  }

  if (portfolioRoot) {
    const compDir = join(portfolioRoot, "src/components");
    if (existsSync(compDir)) {
      const entries = readdirSync(compDir);
      components.push(...parseProductComponents(entries, (f) => safeReadFile(compDir, f), `${portfolioRoot}/src/components`));
    }
  }

  const resolvedHandoffDir = handoffDir || (dsRoot ? join(dsRoot, "design/handoff/latest") : null);
  const handoffJson = readHandoffJson(resolvedHandoffDir);
  if (handoffJson) {
    const figmaRows = parseFigmaCodeSyntax(handoffJson);
    const cssVarNames = new Set(tokens.map((t) => t.name));
    figmaMismatches = diffFigmaCode(figmaRows, cssVarNames);
  }

  const featureNames = collectFeatureNames(components.map((c) => c.source));
  const namingReport = namingRuleReport([...props, ...motionProps.map((mp) => ({ prop: mp.prop, values: mp.values, source: mp.source }))], featureNames);

  return {
    generatedAt: generatedAt || new Date().toISOString(),
    counts: {
      tokens: tokens.length,
      components: components.length,
      props: props.length,
      motionProps: motionProps.length,
      figmaMismatches: figmaMismatches.length,
      namingReport: namingReport.length,
    },
    tokens,
    components,
    props,
    motionProps,
    figmaMismatches,
    namingReport,
  };
}

/* Case-insensitive substring match across every row kind. Returns one flat
   list, each row tagged with its `kind` and the field that matched.

   Matches on TWO axes: the row's own fields (name/value/prop/etc, as
   before), AND the row's category — its `kind` label ("token",
   "component", "prop", "motion-prop") or its `source` file path. A
   category term alone — "motion", "token", "component" — has no reason to
   appear in any individual row's name/value, so a fields-only match missed
   it entirely (round 2 review red: `query motion` returned zero
   motion-prop rows, only components whose name happened to contain
   "motion"). "motion" is a substring of the "motion-prop" kind label, so
   it now returns every motion-prop row; "token"/"component"/"prop" return
   their whole category the same way. */
export function queryIndex(index, term) {
  const needle = term.toLowerCase();
  const hits = [];
  const categoryOrSource = (kind, source) => kind.toLowerCase().includes(needle) || String(source || "").toLowerCase().includes(needle);

  for (const t of index.tokens || []) {
    if (t.name.toLowerCase().includes(needle) || String(t.value).toLowerCase().includes(needle) || categoryOrSource("token", t.source)) {
      hits.push({ kind: "token", ...t });
    }
  }
  for (const c of index.components || []) {
    if (c.name.toLowerCase().includes(needle) || categoryOrSource("component", c.source)) hits.push({ kind: "component", ...c });
  }
  for (const p of index.props || []) {
    if (
      p.component.toLowerCase().includes(needle) ||
      p.prop.toLowerCase().includes(needle) ||
      p.values.some((v) => String(v).toLowerCase().includes(needle)) ||
      categoryOrSource("prop", p.source)
    ) {
      hits.push({ kind: "prop", ...p });
    }
  }
  for (const mp of index.motionProps || []) {
    if (
      mp.prop.toLowerCase().includes(needle) ||
      mp.values.some((v) => String(v).toLowerCase().includes(needle)) ||
      categoryOrSource("motion-prop", mp.source)
    ) {
      hits.push({ kind: "motion-prop", ...mp });
    }
  }
  return hits;
}

// --- CLI -----------------------------------------------------------------

function parseCliArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) out[a.slice(2)] = argv[++i];
    else out._.push(a);
  }
  return out;
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseCliArgs(rest);

  if (cmd === "build") {
    const index = buildIndex({
      dsRoot: args.ds,
      portfolioRoot: args.portfolio,
      motionLawPath: args["motion-law"],
      handoffDir: args.handoff,
    });
    const json = JSON.stringify(index, null, 2);
    if (args.out) {
      writeFileSync(args.out, json);
      console.log(`vocabulary-index: wrote ${args.out} — ${JSON.stringify(index.counts)}`);
    } else {
      console.log(json);
    }
    return;
  }

  if (cmd === "query") {
    const term = args._[0];
    if (!term || !args.index) {
      console.error("Usage: node vocabulary-index.mjs query <term> --index <json path>");
      process.exit(1);
    }
    const index = JSON.parse(readFileSync(args.index, "utf8"));
    const hits = queryIndex(index, term);
    if (hits.length === 0) {
      console.log(`no match for "${term}" in the index`);
      process.exit(0);
    }
    for (const h of hits) console.log(JSON.stringify(h));
    return;
  }

  console.error("Usage: node vocabulary-index.mjs build --ds <path> --portfolio <path> --out <json path>\n       node vocabulary-index.mjs query <term> --index <json path>");
  process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith("vocabulary-index.mjs")) main();
