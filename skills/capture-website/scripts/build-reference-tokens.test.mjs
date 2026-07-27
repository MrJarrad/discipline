import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'build-reference-tokens.mjs');

test('build-reference-tokens CLI reads a capture folder and writes a schema-shaped style-roles.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'capture-website-'));
  try {
    writeFileSync(join(dir, 'tokens.json'), JSON.stringify([
      { tag: 'h1', text: 'Hero', font: 'tnd', size: '48px', weight: '100', tracking: '-1.8px', leading: '48px', color: 'rgb(0,0,0)', bg: 'rgba(0,0,0,0)', radius: '0px' },
    ]));
    writeFileSync(join(dir, 'geometry.json'), JSON.stringify([
      { tag: 'div', x: 0, y: 0, w: 10, h: 10 },
      { tag: 'div', x: 24, y: 0, w: 10, h: 10 },
    ]));
    writeFileSync(join(dir, 'scripts.json'), JSON.stringify([
      { src: 'https://example.com/wp-includes/js/jquery/jquery.min.js', type: 'text/javascript', inlineBytes: 0 },
    ]));
    mkdirSync(join(dir, 'styles'));
    writeFileSync(join(dir, 'styles', '00.css'), '.nav-link:hover { transition: color 0.15s ease-in-out; }');

    const outFile = join(dir, 'style-roles.json');
    execFileSync('node', [SCRIPT, dir, outFile, 'test-ref', 'https://example.com/', 'MARKETING']);

    const result = JSON.parse(readFileSync(outFile, 'utf8'));
    assert.equal(result.schemaVersion, 1);
    assert.equal(result.meta.name, 'test-ref');
    assert.equal(result.meta.classification, 'MARKETING');
    assert.equal(result.typeRoles.length, 1);
    assert.equal(result.spacingScale.module, 24);
    assert.equal(result.stack.framework, 'wordpress');
    assert.equal(result.motionVocabulary.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('build-reference-tokens CLI tolerates a capture folder missing optional artifacts (no scripts.json/styles/motion-samples.json)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'capture-website-'));
  try {
    writeFileSync(join(dir, 'tokens.json'), JSON.stringify([]));
    writeFileSync(join(dir, 'geometry.json'), JSON.stringify([]));

    const outFile = join(dir, 'style-roles.json');
    execFileSync('node', [SCRIPT, dir, outFile, 'sparse-ref', 'https://example.com/']);

    const result = JSON.parse(readFileSync(outFile, 'utf8'));
    assert.equal(result.schemaVersion, 1);
    assert.equal(result.meta.classification, null);
    assert.deepEqual(result.typeRoles, []);
    assert.equal(result.stack.framework, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
