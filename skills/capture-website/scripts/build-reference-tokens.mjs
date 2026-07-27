#!/usr/bin/env node
// Design-reference capture, stage 2 sidecar: assembles a capture folder's raw
// Stage-1 artifacts (tokens.json, geometry.json, scripts.json, styles/*.css,
// motion-samples.json) into schemas/reference-tokens.schema.json — the
// structured lane scripts/reference-compare.mjs diffs, so a gap table doesn't
// require an LLM to re-read analysis.md prose.
// Usage: node build-reference-tokens.mjs <captureDir> <outFile> <name> <source> [classification]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildReferenceTokens } from './lib/style-roles-lib.mjs';

const [captureDir, outFile, name, source, classification] = process.argv.slice(2);
if (!captureDir || !outFile || !name || !source) {
  console.error('Usage: node build-reference-tokens.mjs <captureDir> <outFile> <name> <source> [classification]');
  process.exit(1);
}

const readJson = (relPath, fallback) => {
  const p = join(captureDir, relPath);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback;
};

const tokens = readJson('tokens.json', []);
const geometry = readJson('geometry.json', []);
const scripts = readJson('scripts.json', []);
const motionSamples = readJson('motion-samples.json', []);

const stylesDir = join(captureDir, 'styles');
const cssText = existsSync(stylesDir)
  ? readdirSync(stylesDir).map((f) => readFileSync(join(stylesDir, f), 'utf8')).join('\n')
  : '';

const result = buildReferenceTokens(
  { name, capturedAt: new Date().toISOString().slice(0, 10), source, classification: classification ?? null },
  { tokens, geometry, scripts, cssText, motionSamples },
  { tokensFile: 'tokens.json', geometryFile: 'geometry.json', scriptsFile: 'scripts.json', cssFile: 'styles/*.css' }
);

writeFileSync(outFile, JSON.stringify(result, null, 1));
console.log(`Built ${outFile} from ${captureDir}`);
console.log(`  typeRoles=${result.typeRoles.length} spacingModule=${result.spacingScale.module} palette=${result.palette.length} radii=${result.radii.length} motion=${result.motionVocabulary.length} framework=${result.stack.framework}`);
