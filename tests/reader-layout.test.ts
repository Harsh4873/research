import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

describe('reader layout tokens', () => {
  it('uses defined color tokens for the refresh note and figure fallback', () => {
    expect(css).not.toContain('var(--text-dim)');
    expect(css).not.toContain('var(--accent-line)');
  });

  it('lets the reader tool row wrap on a narrow screen', () => {
    expect(css).toMatch(/\.reader-side-row\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.reader-doc-bar\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  it('gives the text and PDF switch a visible focus ring', () => {
    expect(css).toMatch(/\.reader-format button:focus-visible/);
  });
});
