import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateUsd } from '../src/pricing.js';

test('Opus 4.7 typical message', () => {
  const v = estimateUsd({ model: 'claude-opus-4-7', input: 10, output: 500, cacheRead: 5000, cacheWrite: 1000 });
  // (10*15 + 500*75 + 5000*1.5 + 1000*18.75) / 1e6
  // = (150 + 37500 + 7500 + 18750) / 1e6 = 63900 / 1e6 = 0.0639
  assert.equal(v, 0.0639);
});

test('Sonnet 4.6 cache-heavy', () => {
  const v = estimateUsd({ model: 'claude-sonnet-4-6', input: 0, output: 1000, cacheRead: 100000, cacheWrite: 0 });
  // (0 + 1000*15 + 100000*0.3 + 0) / 1e6 = (15000 + 30000) / 1e6 = 0.045
  assert.equal(v, 0.045);
});

test('GPT-5 reasoning-heavy turn', () => {
  // OpenAI bills reasoning as output; parser already folds reasoning into output.
  const v = estimateUsd({ model: 'gpt-5', input: 1000, output: 3000, cacheRead: 20000, cacheWrite: 0 });
  // (1000*1.25 + 3000*10 + 20000*0.125 + 0) / 1e6 = (1250 + 30000 + 2500) / 1e6 = 0.03375
  assert.equal(v, 0.03375);
});

test('unknown model falls back to Sonnet pricing', () => {
  const v1 = estimateUsd({ model: 'something-unknown', input: 1000, output: 1000, cacheRead: 0, cacheWrite: 0 });
  const v2 = estimateUsd({ model: 'claude-sonnet-4-6', input: 1000, output: 1000, cacheRead: 0, cacheWrite: 0 });
  assert.equal(v1, v2);
});

test('opus family fallback recognizes new opus version names', () => {
  const v1 = estimateUsd({ model: 'claude-opus-4-99', input: 1000, output: 1000, cacheRead: 0, cacheWrite: 0 });
  const v2 = estimateUsd({ model: 'claude-opus-4-7', input: 1000, output: 1000, cacheRead: 0, cacheWrite: 0 });
  assert.equal(v1, v2);
});

test('zero usage produces zero cost', () => {
  assert.equal(estimateUsd({ model: 'claude-opus-4-7', input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }), 0);
});

test('GPT-5-Codex matches GPT-5 pricing', () => {
  const a = estimateUsd({ model: 'gpt-5-codex', input: 1000, output: 1000, cacheRead: 0, cacheWrite: 0 });
  const b = estimateUsd({ model: 'gpt-5', input: 1000, output: 1000, cacheRead: 0, cacheWrite: 0 });
  assert.equal(a, b);
});
