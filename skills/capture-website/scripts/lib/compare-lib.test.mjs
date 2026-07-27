import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeGapTable } from './compare-lib.mjs';

function emptyRef(overrides = {}) {
  return {
    schemaVersion: 1,
    meta: { name: 'ref', capturedAt: '2026-01-01', source: 'https://example.com/', classification: 'MARKETING' },
    typeRoles: [],
    spacingScale: { module: null, steps: [], evidence: [], confidence: 'inferred' },
    palette: [],
    radii: [],
    motionVocabulary: [],
    stack: { framework: null, metaFramework: null, animationLibraries: [], scrollTech: 'unknown', motionConstruction: 'unknown', scrollJack: false, viewTransitions: false, evidence: [] },
    ...overrides,
  };
}

test('computeGapTable flags a reference radius with no close JHD match as off-scale', () => {
  const reference = emptyRef({
    radii: [{ value: '999px', usageCount: 3, evidence: [], confidence: 'observed' }],
  });
  const jhd = emptyRef({
    meta: { name: 'jhd', capturedAt: '2026-01-01', source: 'jhd', classification: null },
    radii: [{ value: '10px', usageCount: 1, evidence: [], confidence: 'observed' }],
  });

  const gap = computeGapTable(reference, jhd);

  const row = gap.radii.find((r) => r.referenceValue === '999px');
  assert.equal(row.status, 'off-scale');
  assert.equal(row.nearestJhdValue, '10px');
  assert.equal(row.deltaPx, 989);
});

test('computeGapTable matches a reference radius within tolerance of a JHD step as on-scale', () => {
  const reference = emptyRef({ radii: [{ value: '10px', usageCount: 1, evidence: [], confidence: 'observed' }] });
  const jhd = emptyRef({
    meta: { name: 'jhd', capturedAt: '2026-01-01', source: 'jhd', classification: null },
    radii: [{ value: '10px', usageCount: 1, evidence: [], confidence: 'observed' }],
  });

  const gap = computeGapTable(reference, jhd);

  const row = gap.radii.find((r) => r.referenceValue === '10px');
  assert.equal(row.status, 'on-scale');
  assert.equal(row.deltaPx, 0);
});

test('computeGapTable reports typeRoles as reference-only when the JHD side has no type ramp', () => {
  const reference = emptyRef({
    typeRoles: [{ role: 'h1-48px', font: 'tnd', size: '48px', weight: '100', tracking: '-1.8px', leading: '48px', declaredVar: null, usageCount: 2, evidence: [], confidence: 'observed' }],
  });
  const jhd = emptyRef({ meta: { name: 'jhd', capturedAt: '2026-01-01', source: 'jhd', classification: null } });

  const gap = computeGapTable(reference, jhd);

  assert.equal(gap.typeRoles.length, 1);
  assert.equal(gap.typeRoles[0].status, 'no-jhd-ramp');
});

test('computeGapTable compares spacing modules and flags whether one divides the other', () => {
  const reference = emptyRef({ spacingScale: { module: 24, steps: [24, 48], evidence: [], confidence: 'observed' } });
  const jhd = emptyRef({
    meta: { name: 'jhd', capturedAt: '2026-01-01', source: 'jhd', classification: null },
    spacingScale: { module: 8, steps: [8, 16, 24], evidence: [], confidence: 'observed' },
  });

  const gap = computeGapTable(reference, jhd);

  assert.equal(gap.spacing.referenceModule, 24);
  assert.equal(gap.spacing.jhdModule, 8);
  assert.equal(gap.spacing.onScale, true);
});

test('computeGapTable counts a summary of gaps by category', () => {
  const reference = emptyRef({
    radii: [{ value: '999px', usageCount: 1, evidence: [], confidence: 'observed' }],
    typeRoles: [{ role: 'h1', font: 'tnd', size: '48px', weight: '100', tracking: 'normal', leading: '48px', declaredVar: null, usageCount: 1, evidence: [], confidence: 'observed' }],
  });
  const jhd = emptyRef({ meta: { name: 'jhd', capturedAt: '2026-01-01', source: 'jhd', classification: null } });

  const gap = computeGapTable(reference, jhd);

  assert.ok(gap.summary.totalGaps >= 2);
  assert.ok(gap.summary.byCategory.radii >= 1);
  assert.ok(gap.summary.byCategory.typeRoles >= 1);
});
