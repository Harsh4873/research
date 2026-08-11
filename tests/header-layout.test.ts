import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The header is the only row rendered on every screen, and at 390px its three
 * groups need more width than the viewport has. It used to have no way to give:
 * `flex-wrap` was unset, `.header-actions` had no rule at all, and no media
 * query touched the header — so the row simply ran off the right of the page and
 * the document scrolled sideways.
 *
 * There is no DOM in this test environment and rendered output is never used to
 * verify this app, so guard the CSS invariants that make the row shrinkable.
 */
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** The body of the first `@media <query>` block. */
function mediaBlock(query: string): string {
  const at = css.indexOf(`@media ${query}`);
  expect(at, `missing @media ${query}`).toBeGreaterThan(-1);
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unterminated @media ${query}`);
}

/** Declarations of every rule whose selector list contains `selector`. */
function declarations(selector: string, source: string): string[] {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) =>
      match[1]
        .split(',')
        .map((part) => part.trim())
        .includes(selector),
    )
    .map((match) => match[2]);
}

/** Rules inside `@media` blocks are not part of the unconditional stylesheet. */
function baseDeclarations(selector: string): string[] {
  let source = css;
  for (const query of ['(max-width: 860px)', '(max-width: 560px)']) {
    source = source.replace(mediaBlock(query), '');
  }
  return declarations(selector, source);
}

describe('header cannot overflow a phone', () => {
  it('lets the header row wrap instead of running off the page', () => {
    const [header] = baseDeclarations('.header-inner');
    expect(header).toBeDefined();
    expect(header).toMatch(/flex-wrap:\s*wrap/);
  });

  it('makes the sync and theme buttons a flex row that can wrap', () => {
    const [actions] = baseDeclarations('.header-actions');
    expect(actions, '.header-actions must have a rule of its own').toBeDefined();
    expect(actions).toMatch(/display:\s*flex/);
    expect(actions).toMatch(/flex-wrap:\s*wrap/);
    expect(actions).toMatch(/gap:/);
  });

  it('gives the section tabs their own row on a phone', () => {
    const phone = mediaBlock('(max-width: 560px)');
    const [nav] = declarations('.header-nav', phone);
    expect(nav, '.header-nav needs a phone rule').toBeDefined();
    expect(nav).toMatch(/width:\s*100%/);
    expect(nav).toMatch(/margin-left:\s*0/);
  });
});
