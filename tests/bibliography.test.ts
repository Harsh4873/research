import { describe, expect, it } from 'vitest';
import { BIBLIOGRAPHY, bibliographyText } from '../src/content/bibliography';
import { parsePaperIds } from '../src/lib/paper-id';

describe('the manuscript bibliography', () => {
  it('is a deduplicated list of DOIs from both documents', () => {
    expect(BIBLIOGRAPHY).toHaveLength(63);
    const dois = BIBLIOGRAPHY.map((entry) => entry.doi.toLowerCase());
    expect(new Set(dois).size).toBe(dois.length);
    for (const entry of BIBLIOGRAPHY) {
      expect(entry.doi).toMatch(/^10\.\d{4,9}\//);
      expect(entry.label).toMatch(/\d{4}$/);
    }
    expect(BIBLIOGRAPHY.filter((entry) => entry.source !== 'main').length).toBeGreaterThan(0);
    expect(BIBLIOGRAPHY.filter((entry) => entry.source === 'both').length).toBeGreaterThan(0);
  });

  it('keeps DOIs whose suffix contains brackets intact', () => {
    const bracketed = BIBLIOGRAPHY.filter((entry) => entry.doi.includes('('));
    expect(bracketed.length).toBeGreaterThan(0);
    for (const entry of bracketed) {
      expect(entry.doi).toContain(')');
      expect(entry.doi).not.toMatch(/\($/);
    }
    expect(BIBLIOGRAPHY.map((e) => e.doi)).toContain('10.1016/S1473-3099(09)70282-8');
  });

  it('parses back out of the importer as exactly that many papers', () => {
    const ids = parsePaperIds(bibliographyText());
    expect(ids).toHaveLength(BIBLIOGRAPHY.length);
    for (const entry of BIBLIOGRAPHY) {
      expect(ids.some((id) => id.kind === 'doi' && id.value.toLowerCase() === entry.doi.toLowerCase())).toBe(true);
    }
  });
});
