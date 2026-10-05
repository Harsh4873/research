import { describe, expect, it } from 'vitest';
import { appendPaperNote, applyPaperRefresh, splitPaperNotes } from '../src/lib/paper-set';

const ABSTRACT = `---
title: Sample
pmid: "123"
source: PubMed abstract
---

# Sample

Abstract body.
`;

const FULL_TEXT = `---
title: Sample
pmid: "123"
source: Europe PMC full text
---

# Sample

Abstract body.

## Methods

Full body.
`;

describe('paper notes section', () => {
  it('adds the notes heading on the first note and appends later notes', () => {
    const once = appendPaperNote(ABSTRACT, 'First idea.');
    expect(once).toContain('## Added notes');
    expect(once).toContain('First idea.');
    const twice = appendPaperNote(once, 'Second idea.');
    expect(twice.match(/## Added notes/g)).toHaveLength(1);
    expect(twice).toContain('First idea.');
    expect(twice).toContain('Second idea.');
  });

  it('splits fetched content from user notes', () => {
    const markdown = appendPaperNote(ABSTRACT, 'Keep me.');
    const { content, notes } = splitPaperNotes(markdown);
    expect(content).toBe(ABSTRACT.trimEnd());
    expect(notes).toContain('## Added notes');
    expect(notes).toContain('Keep me.');
  });
});

describe('paper refresh preserves notes', () => {
  it('keeps notes written before the refresh under the fresh content', () => {
    const current = appendPaperNote(ABSTRACT, 'My annotation.');
    const merged = applyPaperRefresh(current, FULL_TEXT);
    expect(merged).toContain('## Methods');
    expect(merged).toContain('My annotation.');
    // Fetched content wins; the notes section stays last.
    expect(merged.indexOf('## Methods')).toBeLessThan(merged.indexOf('## Added notes'));
  });

  it('keeps a note written while the fetch was in flight', () => {
    // Fetch starts against a note-free copy; the user writes before it lands.
    const fetched = FULL_TEXT;
    const liveAtApplyTime = appendPaperNote(ABSTRACT, 'In-flight idea.');
    const merged = applyPaperRefresh(liveAtApplyTime, fetched);
    expect(merged).toContain('## Methods');
    expect(merged).toContain('In-flight idea.');
  });

  it('supports abstract-to-full-text upgrades without losing notes', () => {
    const current = appendPaperNote(ABSTRACT, 'Question about methods.');
    const merged = applyPaperRefresh(current, FULL_TEXT);
    expect(merged).toContain('source: Europe PMC full text');
    expect(merged).toContain('Question about methods.');
  });

  it('leaves a note-free paper exactly as fetched', () => {
    expect(applyPaperRefresh(ABSTRACT, FULL_TEXT)).toBe(FULL_TEXT);
  });

  it('detects an unchanged source even when notes exist', () => {
    const current = appendPaperNote(FULL_TEXT, 'Still here.');
    // Same fetched content merged over the current copy: nothing new.
    expect(applyPaperRefresh(current, FULL_TEXT).trim()).toBe(current.trim());
  });

  it('matches the notes heading case-insensitively', () => {
    const current = `${FULL_TEXT.trimEnd()}\n\n## added notes\n\nLowercase heading.\n`;
    const merged = applyPaperRefresh(current, `${FULL_TEXT.trimEnd()}\n\n## Results\n\nNew.\n`);
    expect(merged).toContain('Lowercase heading.');
    expect(merged).toContain('## Results');
  });
});
