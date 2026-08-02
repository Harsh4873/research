import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePaperIds } from '../src/lib/paper-id';
import { docxXmlToText, isReferenceFile } from '../src/lib/reference-file';
import { dedupePapers, paperIdentity } from '../src/lib/paper-set';

describe('parsePaperIds', () => {
  it('reads a comma-separated PMID list', () => {
    const ids = parsePaperIds('11713128, 15220232, 17638189');
    expect(ids).toEqual([
      { kind: 'pmid', value: '11713128' },
      { kind: 'pmid', value: '15220232' },
      { kind: 'pmid', value: '17638189' },
    ]);
  });

  it('reads one identifier per line and mixed kinds', () => {
    const ids = parsePaperIds('23193287\nPMC3531190\n10.1093/nar/gks1195\n');
    expect(ids.map((id) => id.kind)).toEqual(['pmcid', 'doi', 'pmid']);
  });

  it('ignores years, volumes, and page numbers in a reference line', () => {
    const line = 'Klein A, Muster B. A study of things. J Extreme Ecol. 2019;12(4):133-148. PMID: 31671150.';
    expect(parsePaperIds(line)).toEqual([{ kind: 'pmid', value: '31671150' }]);
  });

  it('does not mistake the digits inside a DOI or PMCID for a PMID', () => {
    expect(parsePaperIds('doi:10.1371/journal.pcbi.1005595')).toEqual([
      { kind: 'doi', value: '10.1371/journal.pcbi.1005595' },
    ]);
    expect(parsePaperIds('PMC12613553')).toEqual([{ kind: 'pmcid', value: 'PMC12613553' }]);
  });

  it('deduplicates repeats across formats', () => {
    const ids = parsePaperIds('23193287 and again PMID: 23193287, plus PMC3531190 and PMC 3531190');
    expect(ids).toHaveLength(2);
  });

  it('returns nothing for prose with no identifiers', () => {
    expect(parsePaperIds('See the attached list of papers from 2019 and 2021.')).toEqual([]);
  });
});

describe('reference files', () => {
  it('recognises the list formats it can read', () => {
    expect(isReferenceFile('References.docx')).toBe(true);
    expect(isReferenceFile('pmids.txt')).toBe(true);
    expect(isReferenceFile('export.ris')).toBe(true);
    expect(isReferenceFile('paper.pdf')).toBe(false);
  });

  it('turns Word paragraphs into one line each', () => {
    const xml = `<?xml version="1.0"?>
      <w:document xmlns:w="x"><w:body>
        <w:p><w:r><w:t>The 30 numbered PMIDs</w:t></w:r></w:p>
        <w:p><w:r><w:t xml:space="preserve">11713128, </w:t></w:r><w:r><w:t>15220232</w:t></w:r></w:p>
        <w:p/>
        <w:tbl><w:tr><w:tc><w:p><w:r><w:t>PMID 17638189</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      </w:body></w:document>`;
    const text = docxXmlToText(xml);
    expect(text.split('\n')).toEqual(['The 30 numbered PMIDs', '11713128, 15220232', 'PMID 17638189']);
    expect(parsePaperIds(text)).toHaveLength(3);
  });
});

describe('a reference-list document', () => {
  const fixture = 'tests/fixtures/reference-list-document.xml';
  const text = docxXmlToText(readFileSync(fixture, 'utf8'));
  const ids = parsePaperIds(text);

  it('finds every identifier in the summary line and the table', () => {
    const pmids = ids.filter((id) => id.kind === 'pmid').map((id) => id.value);
    expect(new Set(pmids).size).toBe(15);
    expect(ids.filter((id) => id.kind === 'doi')).toHaveLength(15);
    expect(ids.filter((id) => id.kind === 'pmcid')).toHaveLength(8);
  });

  it('never mistakes a year, volume, or page range for a PMID', () => {
    const pmids = ids.filter((id) => id.kind === 'pmid').map((id) => id.value);
    expect(pmids.every((p) => p.length >= 7)).toBe(true);
    expect(pmids).not.toContain('2014');
  });

  it('collapses to one paper per row once the identifiers resolve', () => {
    // Every row cites the same work three ways; resolution merges them.
    const resolved = ids.map((id, index) => ({
      meta: { pmid: `${11713128 + (index % 15)}` },
      fullText: false,
    }));
    expect(dedupePapers(resolved as never[])).toHaveLength(15);
  });
});

describe('deduplicating a reference list', () => {
  const paper = (meta: Record<string, unknown>, fullText = false) => ({ meta, fullText }) as never;

  it('collapses the same paper cited by PMID, DOI, and PMCID', () => {
    const deduped = dedupePapers([
      paper({ pmid: '23193287', title: 'GenBank' }),
      paper({ pmid: '23193287', pmcid: 'PMC3531190', title: 'GenBank' }),
      paper({ pmid: '23193287', doi: '10.1093/nar/gks1195', title: 'GenBank' }),
    ]);
    expect(deduped).toHaveLength(1);
  });

  it('keeps genuinely different papers', () => {
    expect(dedupePapers([paper({ pmid: '1' }), paper({ pmid: '2' }), paper({ doi: '10.1/x' })])).toHaveLength(3);
  });

  it('prefers the full-text copy when the same paper arrives twice', () => {
    const deduped = dedupePapers([
      paper({ pmid: '5', title: 'A paper' }, false),
      paper({ pmid: '5', title: 'A paper' }, true),
    ]);
    expect(deduped).toHaveLength(1);
    expect((deduped[0] as { fullText: boolean }).fullText).toBe(true);
  });

  it('falls back to the title when a record carries no identifier', () => {
    expect(paperIdentity({ title: 'Some Paper!' })).toBe(paperIdentity({ title: 'some  paper' }));
    expect(paperIdentity({ pmid: '7', title: 'x' })).toBe('pmid:7');
  });
});
