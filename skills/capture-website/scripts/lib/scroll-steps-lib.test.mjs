import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScrollSteps } from './scroll-steps-lib.mjs';

test('computeScrollSteps never returns 0, even when measured height is 0 (the original bug)', () => {
  assert.equal(computeScrollSteps(0, 844), 1);
});

test('computeScrollSteps never returns 0 for a negative height either', () => {
  assert.equal(computeScrollSteps(-100, 844), 1);
});

test('computeScrollSteps returns one step when content fits in a single viewport', () => {
  assert.equal(computeScrollSteps(600, 844), 1);
});

test('computeScrollSteps rounds up partial viewports', () => {
  assert.equal(computeScrollSteps(1000, 844), 2);
});

test('computeScrollSteps caps at maxSteps for very tall pages', () => {
  assert.equal(computeScrollSteps(100000, 844, 20), 20);
});
