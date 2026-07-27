#!/usr/bin/env node
// Machine gap table: diffs a reference-tokens.json (captured website, Stage 2
// sidecar built by build-reference-tokens.mjs) against a JHD-side
// reference-tokens.json, using the same schema capture-figma's structured
// lane already speaks. Emits JSON (machine-readable) and a markdown table
// (human-readable) — no LLM re-reading of analysis.md prose required.
// Usage: node reference-compare.mjs <referenceFile> <jhdFile> <outFile.json> [outFile.md]
import { readFileSync, writeFileSync } from 'node:fs';
import { computeGapTable } from './lib/compare-lib.mjs';

const [referenceFile, jhdFile, outFile, outMdFile] = process.argv.slice(2);
if (!referenceFile || !jhdFile || !outFile) {
  console.error('Usage: node reference-compare.mjs <referenceFile> <jhdFile> <outFile.json> [outFile.md]');
  process.exit(1);
}

const reference = JSON.parse(readFileSync(referenceFile, 'utf8'));
const jhd = JSON.parse(readFileSync(jhdFile, 'utf8'));
const gap = computeGapTable(reference, jhd);

writeFileSync(outFile, JSON.stringify(gap, null, 1));

function mdTable(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return [head, sep, body].join('\n');
}

const md = `# Gap table: ${gap.reference.name} vs ${gap.jhd.name}

Reference: ${gap.reference.source}
JHD: ${gap.jhd.source}

**${gap.summary.totalGaps} gaps** (typeRoles=${gap.summary.byCategory.typeRoles}, radii=${gap.summary.byCategory.radii}, palette=${gap.summary.byCategory.palette}, spacing=${gap.summary.byCategory.spacing})

## Type roles

${gap.typeRoles.length ? mdTable(
  ['role', 'reference size', 'nearest JHD role', 'JHD size', 'Δpx', 'status'],
  gap.typeRoles.map((r) => [r.role, r.referenceSize, r.matchedJhdRole ?? '—', r.jhdSize ?? '—', r.deltaPx ?? '—', r.status])
) : '_none_'}

## Spacing

| reference module | JHD module | on-scale |
| --- | --- | --- |
| ${gap.spacing.referenceModule ?? '—'} | ${gap.spacing.jhdModule ?? '—'} | ${gap.spacing.onScale ?? '—'} |

## Radii

${gap.radii.length ? mdTable(
  ['reference value', 'usage', 'nearest JHD value', 'Δpx', 'status'],
  gap.radii.map((r) => [r.referenceValue, r.usageCount, r.nearestJhdValue ?? '—', r.deltaPx ?? '—', r.status])
) : '_none_'}

## Palette

${gap.palette.length ? mdTable(
  ['reference value', 'usage', 'role guess', 'status'],
  gap.palette.map((p) => [p.referenceValue, p.usageCount, p.roleGuess ?? '—', p.status])
) : '_none_'}

## Motion vocabulary (reference-only — JHD has no marketing-page motion axis)

${gap.motion.length ? mdTable(
  ['name', 'property', 'trigger', 'duration', 'curve', 'observed'],
  gap.motion.map((m) => [m.name, m.property, m.trigger, m.duration ?? '—', m.curve ?? '—', m.observed])
) : '_none_'}

## Stack

- Reference: framework=${gap.stack.reference.framework ?? '—'}, metaFramework=${gap.stack.reference.metaFramework ?? '—'}, animationLibraries=[${gap.stack.reference.animationLibraries.join(', ')}], scrollTech=${gap.stack.reference.scrollTech}, motionConstruction=${gap.stack.reference.motionConstruction}
- JHD: framework=${gap.stack.jhd.framework ?? '—'}, metaFramework=${gap.stack.jhd.metaFramework ?? '—'}, animationLibraries=[${gap.stack.jhd.animationLibraries.join(', ')}], scrollTech=${gap.stack.jhd.scrollTech}, motionConstruction=${gap.stack.jhd.motionConstruction}
`;

if (outMdFile) writeFileSync(outMdFile, md);
console.log(`Gap table: ${gap.summary.totalGaps} total gaps → ${outFile}${outMdFile ? ', ' + outMdFile : ''}`);
