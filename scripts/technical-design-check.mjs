#!/usr/bin/env node
/* technical-design-check — grep-lane conformance to the ratified spectrum
   report (~/JHD/vault/references/technical-design-spectrum-2026-08-11.md),
   distilled into laws at skills/design-craft/references/TECHNICAL-DESIGN.md.

   Interface (deep module — small surface, the check table is all
   implementation):

     checkTechnicalDesign({ cssFiles, metaFiles })
       -> { ok, warnings, summary }

   cssFiles / metaFiles: [{ path, text }] — the caller reads whatever files
   are relevant on disk (a project's globals.css, its root layout/HTML) and
   hands over their text; this module never touches the filesystem itself
   except in the CLI below, matching the other lanes' pure-core convention
   (conformance-check.mjs, binding-check.mjs).

   Warning shape: { id, row, message, file?, line? }. `id` is stable and
   spectrum-row-keyed ("spectrum-<row>-<slug>") so a reviewer or a future
   runtime lane can cite the exact report row without re-deriving it.

   THIS IS THE GREP LANE ONLY. Three §6 rows the report ranks as gaps — #1
   (LCP image priority), #9 (Core Web Vitals measurement), #10 (video colour
   metadata / audio loudness) — need a throttled trace, field CWV reporting,
   or an ffprobe/ffmpeg pass respectively. None of that is grep-able from
   source text, so this module deliberately does not check them; see the
   "Runtime-lane TODO" section of TECHNICAL-DESIGN.md. Row #3 (font
   smoothing) is excluded on purpose too — operator-call-pending, not a law.

   Every check here is PRESENCE-based (a grep hit or its absence), not a
   correctness check on the value — e.g. the color-scheme check passes on
   any `color-scheme:` declaration, not specifically `light`. That matches
   the task's own framing ("grep-able CSS/meta presence") and the report's
   acceptance criteria, which require rendering/measurement to actually
   verify correctness — out of scope for this lane.                        */
import { readFileSync, existsSync } from "node:fs";

// ---- line-number lookup ---------------------------------------------------

function lineAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

// ---- check table ------------------------------------------------------------

// kind "require": warn once if the pattern matches NOTHING across every text
//   in `target`. No file/line — it's an absence, not a located defect.
// kind "forbid": warn once PER MATCH found in `target` texts — the match
//   itself is the defect, so file/line point at it.
const CHECKS = [
  {
    id: "spectrum-2-forced-colors",
    row: "§6 #2 / §J forced-colors",
    target: "css",
    kind: "require",
    pattern: /@media\s*\(\s*forced-colors\s*:\s*active\s*\)/i,
    message: "no @media (forced-colors: active) block found — focus rings and other box-shadow-only affordances vanish in Windows High Contrast",
  },
  {
    id: "spectrum-4-print-stylesheet",
    row: "§6 #4 / §K",
    target: "css",
    kind: "require",
    pattern: /@media\s+print\b/i,
    message: "no @media print block found — printing/PDF-ing a page ships raw chrome and, on dark grounds, invisible white-on-white text",
  },
  {
    id: "spectrum-5-color-scheme",
    row: "§6 #5 / §H",
    target: "both",
    kind: "require",
    pattern: /color-scheme/i,
    message: "no color-scheme declared (CSS property or <meta name=\"color-scheme\">) — a dark-preferring OS gets a mismatched UA canvas/scrollbar",
  },
  {
    id: "spectrum-5-theme-color",
    row: "§6 #5 / §H",
    target: "meta",
    kind: "require",
    pattern: /theme-color/i,
    message: "no <meta name=\"theme-color\"> found — iOS/Android chrome can show a colour seam against the page",
  },
  {
    id: "spectrum-6-scrollbar-gutter",
    row: "§6 #6 / §C",
    target: "css",
    kind: "require",
    pattern: /scrollbar-gutter\s*:/i,
    message: "no scrollbar-gutter declared — Windows/Linux visitors get a horizontal shift navigating short-page to long-page",
  },
  {
    id: "spectrum-7-transition-all",
    row: "§6 #7 / §D",
    target: "css",
    kind: "forbid",
    pattern: /transition-all\b|transition\s*:\s*all\b/gi,
    message: "transition: all / transition-all found — transitions properties never intended, including layout ones",
  },
  {
    id: "spectrum-8-text-size-adjust",
    row: "§6 #8 / §A",
    target: "css",
    kind: "require",
    pattern: /text-size-adjust\s*:/i,
    message: "no text-size-adjust declared — an iOS rotation can silently resize and rewrap a Figma-exact layout",
  },
];

function targetsFor(check, cssFiles, metaFiles) {
  if (check.target === "css") return cssFiles;
  if (check.target === "meta") return metaFiles;
  return [...cssFiles, ...metaFiles];
}

export function checkTechnicalDesign({ cssFiles = [], metaFiles = [] } = {}) {
  const warnings = [];

  for (const check of CHECKS) {
    const files = targetsFor(check, cssFiles, metaFiles);

    if (check.kind === "require") {
      const found = files.some((f) => check.pattern.test(f.text));
      if (!found) {
        warnings.push({ id: check.id, row: check.row, message: check.message });
      }
      continue;
    }

    // kind === "forbid": every match, in every file, is its own warning.
    for (const f of files) {
      const re = new RegExp(check.pattern.source, check.pattern.flags.includes("g") ? check.pattern.flags : check.pattern.flags + "g");
      let match;
      while ((match = re.exec(f.text)) !== null) {
        warnings.push({
          id: check.id,
          row: check.row,
          message: check.message,
          file: f.path,
          line: lineAt(f.text, match.index),
        });
      }
    }
  }

  const ok = warnings.length === 0;
  const summaryLines = [`Technical-design check: ${CHECKS.length} rows checked, ${warnings.length} warnings.`];
  for (const w of warnings) {
    const loc = w.file ? ` (${w.file}${w.line ? `:${w.line}` : ""})` : "";
    summaryLines.push(`  [WARN ${w.id}] ${w.message}${loc}`);
  }
  return { ok, warnings, summary: summaryLines.join("\n") };
}

// ---- CLI --------------------------------------------------------------

function isMainModule() {
  return import.meta.url === `file://${process.argv[1]}`;
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  const collect = (flag) => {
    const paths = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === flag) paths.push(args[i + 1]);
    }
    return paths;
  };

  const cssPaths = collect("--css");
  const metaPaths = collect("--meta");

  if (cssPaths.length === 0 && metaPaths.length === 0) {
    console.error("[technical-design-check] usage: --css <path> [--css <path> ...] --meta <path> [--meta <path> ...]");
    process.exit(2);
  }

  const readAll = (paths) =>
    paths.map((p) => {
      if (!existsSync(p)) throw new Error(`file not found: ${p}`);
      return { path: p, text: readFileSync(p, "utf8") };
    });

  try {
    const cssFiles = readAll(cssPaths);
    const metaFiles = readAll(metaPaths);
    const result = checkTechnicalDesign({ cssFiles, metaFiles });
    console.log(result.summary);
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error(`[technical-design-check] ${err.message}`);
    process.exit(2);
  }
}
