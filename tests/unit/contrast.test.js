// WCAG AA contrast guarantees for both themes, computed from the actual CSS
// tokens — a palette tweak that breaks accessibility fails the build.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(import.meta.dirname, '../../src/assets/css/style.css'), 'utf8');

function tokens(blockRe) {
  const block = css.match(blockRe)?.[1];
  expect(block, `token block ${blockRe} not found`).toBeTruthy();
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]),
  );
}

const dark = tokens(/:root \{([^}]+)\}/);
const light = tokens(/:root\[data-theme="light"\] \{([^}]+)\}/);
// light block only overrides — fall back to dark for shared tokens (amber, btn-text)
const lightFull = { ...dark, ...light };

function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, minimum] — 4.5 for text (WCAG 1.4.3 AA),
// 3.0 for UI component boundaries (WCAG 1.4.11).
const CHECKS = [
  ['text', 'bg', 4.5],
  ['text', 'panel', 4.5],
  ['text', 'panel-raised', 4.5],
  ['dim', 'panel', 4.5],
  ['dim', 'bg', 4.5],
  ['dim-2', 'bg', 4.5],
  ['accent', 'panel', 4.5],
  ['accent', 'panel-raised', 4.5],
  ['red', 'panel', 4.5],
  ['green', 'panel', 4.5],
  ['btn-text', 'amber', 4.5],
  ['line-strong', 'panel', 3.0],
  ['line-strong', 'panel-raised', 3.0],
];

for (const [name, theme] of [['dark', dark], ['light', lightFull]]) {
  describe(`${name} theme contrast`, () => {
    for (const [fg, bg, min] of CHECKS) {
      it(`${fg} on ${bg} ≥ ${min}:1`, () => {
        expect(theme[fg], `token --${fg} missing`).toBeTruthy();
        expect(theme[bg], `token --${bg} missing`).toBeTruthy();
        const r = ratio(theme[fg], theme[bg]);
        expect(r, `${theme[fg]} on ${theme[bg]} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
      });
    }
  });
}
