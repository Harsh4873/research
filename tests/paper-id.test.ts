import { describe, expect, it } from 'vitest';
import { describePaperId, europePmcQuery, normalizePmcid, parsePaperId, parsePaperIds, trimDoi } from '../src/lib/paper-id';
import { createPaperSet, isPaperSet, paperFrontMatter, paperSubtitle } from '../src/lib/paper-set';

describe('parsePaperId', () => {
  it('reads bare PMIDs and labelled PMIDs', () => {
    expect(parsePaperId('23193287')).toEqual({ kind: 'pmid', value: '23193287' });
    expect(parsePaperId('  PMID: 23193287 ')).toEqual({ kind: 'pmid', value: '23193287' });
    expect(parsePaperId('pmid 23193287')).toEqual({ kind: 'pmid', value: '23193287' });
  });

  it('reads PMC identifiers with and without the prefix', () => {
    expect(parsePaperId('PMC3531190')).toEqual({ kind: 'pmcid', value: 'PMC3531190' });
    expect(parsePaperId('pmc 3531190')).toEqual({ kind: 'pmcid', value: 'PMC3531190' });
  });

  it('reads DOIs, bare and as URLs', () => {
    expect(parsePaperId('10.1093/nar/gks1195')).toEqual({ kind: 'doi', value: '10.1093/nar/gks1195' });
    expect(parsePaperId('https://doi.org/10.1093/nar/gks1195')).toEqual({
      kind: 'doi',
      value: '10.1093/nar/gks1195',
    });
    expect(parsePaperId('doi:10.1038/s41586-020-2649-2.')).toEqual({
      kind: 'doi',
      value: '10.1038/s41586-020-2649-2',
    });
  });

  it('reads PubMed, PMC, and Europe PMC URLs', () => {
    expect(parsePaperId('https://pubmed.ncbi.nlm.nih.gov/23193287/')).toEqual({ kind: 'pmid', value: '23193287' });
    expect(parsePaperId('https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3531190/')).toEqual({
      kind: 'pmcid',
      value: 'PMC3531190',
    });
    expect(parsePaperId('https://europepmc.org/article/MED/23193287')).toEqual({ kind: 'pmid', value: '23193287' });
  });

  it('accepts short PMIDs, since PubMed numbering starts at 1', () => {
    expect(parsePaperId('1')).toEqual({ kind: 'pmid', value: '1' });
    expect(parsePaperId('12')).toEqual({ kind: 'pmid', value: '12' });
  });

  it('rejects text that is not an identifier', () => {
    expect(parsePaperId('')).toBeNull();
    expect(parsePaperId('some paper about mice')).toBeNull();
    expect(parsePaperId('99999999999')).toBeNull(); // too long to be a PMID
  });
});

describe('query building', () => {
  it('builds the right Europe PMC query per identifier kind', () => {
    expect(europePmcQuery({ kind: 'pmid', value: '1' })).toBe('EXT_ID:1 AND SRC:MED');
    expect(europePmcQuery({ kind: 'pmcid', value: '3531190' })).toBe('PMCID:PMC3531190');
    expect(europePmcQuery({ kind: 'doi', value: '10.1/x' })).toBe('DOI:"10.1/x"');
  });

  it('normalises PMCIDs and describes identifiers for the UI', () => {
    expect(normalizePmcid('pmc3531190')).toBe('PMC3531190');
    expect(describePaperId({ kind: 'pmid', value: '5' })).toBe('PMID 5');
    expect(describePaperId({ kind: 'doi', value: '10.1/x' })).toBe('DOI 10.1/x');
  });
});

describe('paper sets', () => {
  it('marks Review sets with an id prefix that survives storage', () => {
    const set = createPaperSet('A paper', '---\ntitle: A paper\n---\n\n# A paper\n', 1000);
    expect(isPaperSet(set.id)).toBe(true);
    expect(isPaperSet('abc-123')).toBe(false);
    // Ids must satisfy the synced document rules.
    expect(set.id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('reads front matter back for the paper cards', () => {
    const markdown = '---\ntitle: A paper\njournal: Nature\nyear: 2020\npmid: 12345\n---\n\n# A paper\n\nBody.\n';
    const front = paperFrontMatter(markdown);
    expect(front).toMatchObject({ journal: 'Nature', year: '2020', pmid: '12345' });
    expect(paperSubtitle(front)).toBe('Nature · 2020 · PMID 12345');
  });

  it('falls back to a DOI when there is no PMID', () => {
    expect(paperSubtitle({ journal: 'Cell', year: '2021', doi: '10.1/x' })).toBe('Cell · 2021 · DOI 10.1/x');
    expect(paperSubtitle({})).toBe('');
  });
});

describe('DOIs that contain brackets', () => {
  it('keeps a balanced bracket in the suffix', () => {
    expect(parsePaperId('10.1016/S1473-3099(09)70282-8')).toEqual({
      kind: 'doi',
      value: '10.1016/S1473-3099(09)70282-8',
    });
    expect(parsePaperIds('See 10.1016/S0140-6736(24)02317-1 for the meta-analysis.').map((id) => id.value)).toEqual([
      '10.1016/S0140-6736(24)02317-1',
    ]);
  });

  it('still drops a bracket that closes the sentence, not the DOI', () => {
    expect(parsePaperIds('(reported previously: 10.1093/molbev/msaa069).').map((id) => id.value)).toEqual([
      '10.1093/molbev/msaa069',
    ]);
    expect(parsePaperId('10.1093/cid/cir939.')).toEqual({ kind: 'doi', value: '10.1093/cid/cir939' });
  });

  it('trims a trailing bracket only when it is unmatched', () => {
    expect(trimDoi('10.1000/abc(1)')).toBe('10.1000/abc(1)');
    expect(trimDoi('10.1000/abc)')).toBe('10.1000/abc');
    expect(trimDoi('10.1000/abc(1))')).toBe('10.1000/abc(1)');
    expect(trimDoi('10.1000/abc.,;')).toBe('10.1000/abc');
  });
});
