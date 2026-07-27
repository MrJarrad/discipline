import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'reference-compare.mjs');

function baseTokens(overrides = {}) {
  return {
    schemaVersion: 1,
    meta: { name: 'x', capturedAt: '2026-01-01', source: 'https://example.com/', classification: null },
    typeRoles: [],
    spacingScale: { module: null, steps: [], evidence: [], confidence: 'inferred' },
    palette: [],
    radii: [],
    motionVocabulary: [],
    stack: { framework: null, metaFramework: null, animationLibraries: [], scrollTech: 'unknown', motionConstruction: 'unknown', scrollJack: false, viewTransitions: false, evidence: [] },
    ...overrides,
  };
}

test('reference-compare CLI writes a JSON gap table and a markdown report from two reference-tokens.json files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reference-compare-'));
  try {
    const reference = baseTokens({
      meta: { name: 'toby-ng', capturedAt: '2026-01-01', source: 'https://www.toby-ng.com/', classification: 'MARKETING' },
      radii: [{ value: '999px', usageCount: 1, evidence: [], confidence: 'observed' }],
    });
    const jhd = baseTokens({
      meta: { name: 'jhd', capturedAt: '2026-01-01', source: 'jhd', classification: null },
      radii: [{ value: '10px', usageCount: 1, evidence: [], confidence: 'observed' }],
    });
    const refFile = join(dir, 'toby-ng.reference-tokens.json');
    const jhdFile = join(dir, 'jhd.reference-tokens.json');
    writeFileSync(refFile, JSON.stringify(reference));
    writeFileSync(jhdFile, JSON.stringify(jhd));

    const outJson = join(dir, 'gap-table.json');
    const outMd = join(dir, 'gap-table.md');
    execFileSync('node', [SCRIPT, refFile, jhdFile, outJson, outMd]);

    const gap = JSON.parse(readFileSync(outJson, 'utf8'));
    assert.equal(gap.reference.name, 'toby-ng');
    assert.equal(gap.jhd.name, 'jhd');
    assert.equal(gap.radii[0].status, 'off-scale');
    assert.ok(gap.summary.totalGaps >= 1);

    const md = readFileSync(outMd, 'utf8');
    assert.match(md, /Gap table: toby-ng vs jhd/);
    assert.match(md, /999px/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
