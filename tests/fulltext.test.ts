import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAnyFullTextXml, hasArticleBody, lookupPaper, openAccessPdfUrls } from '../src/lib/europepmc';

const BODY = `<article><front><article-meta>
  <article-id pub-id-type="pmcid">PMC900001</article-id>
  <title-group><article-title>An author manuscript</article-title></title-group>
</article-meta></front><body><sec><title>Methods</title><p>${'We measured the thing carefully. '.repeat(12)}</p></sec></body></article>`;

const LETTER = `<article><front><article-meta>
  <article-id pub-id-type="pmcid">PMC13259578</article-id>
  <title-group><article-title>A letter with no sections</article-title></title-group>
</article-meta></front><body><p>${'The health system needs more than resilience. '.repeat(20)}</p></body></article>`;

const STUB = `<article><front><article-meta>
  <title-group><article-title>A citation-only record</article-title></title-group>
</article-meta></front></article>`;

function routeFetch(routes: Record<string, { status?: number; body?: string; contentType?: string }>) {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(routes).find((fragment) => url.includes(fragment));
    const hit = key ? routes[key] : { status: 404 };
    const status = hit.status ?? 200;
    const body = hit.body ?? '';
    const headers = new Headers({ 'Content-Type': hit.contentType ?? 'text/plain' });
    return {
      ok: status >= 200 && status < 300,
      status,
      headers,
      text: async () => body,
      json: async () => JSON.parse(body || 'null'),
      arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    } as Response;
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('hasArticleBody', () => {
  it('accepts a body with real content', () => {
    expect(hasArticleBody(BODY)).toBe(true);
  });

  it('rejects a record that carries no body at all', () => {
    expect(hasArticleBody(STUB)).toBe(false);
  });

  it('rejects an empty or near-empty body', () => {
    expect(hasArticleBody('<article><body/></article>')).toBe(false);
    expect(hasArticleBody('<article><body>   </body></article>')).toBe(false);
    expect(hasArticleBody('<article><body><p>Too short.</p></body></article>')).toBe(false);
  });
});

describe('fetchAnyFullTextXml', () => {
  it('uses Europe PMC when it serves the full text, and asks no one else', async () => {
    let ncbiCalls = 0;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('eutils')) ncbiCalls += 1;
      return { ok: true, status: 200, text: async () => BODY } as Response;
    });
    const source = await fetchAnyFullTextXml('PMC900001');
    expect(source?.from).toBe('europepmc');
    expect(ncbiCalls).toBe(0);
  });

  it('falls back to PubMed Central for an author manuscript Europe PMC does not serve', async () => {
    routeFetch({ 'europepmc': { status: 404 }, 'eutils': { body: BODY } });
    const source = await fetchAnyFullTextXml('PMC900001');
    expect(source?.from).toBe('pmc');
    expect(source?.xml).toContain('<body>');
  });

  it('prefers the copy that actually has a body', async () => {
    routeFetch({ 'europepmc': { body: STUB }, 'eutils': { body: BODY } });
    expect((await fetchAnyFullTextXml('PMC900001'))?.from).toBe('pmc');
  });

  it('keeps the Europe PMC record when neither archive has a body', async () => {
    routeFetch({ 'europepmc': { body: STUB }, 'eutils': { body: STUB } });
    const source = await fetchAnyFullTextXml('PMC900001');
    expect(source?.from).toBe('europepmc');
  });

  it('returns nothing when the article is in neither archive', async () => {
    routeFetch({});
    expect(await fetchAnyFullTextXml('PMC900001')).toBeNull();
  });

  it('accepts a PMC id written either way', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return { ok: false, status: 404, text: async () => '' } as Response;
    });
    await fetchAnyFullTextXml('900001');
    expect(seen[0]).toContain('PMC900001/fullTextXML');
    expect(seen[1]).toContain('db=pmc&id=900001');
  });
});

describe('lookupPaper reaches author manuscripts', () => {
  const record = {
    resultList: {
      result: [
        {
          pmid: '19926035',
          pmcid: 'PMC900001',
          doi: '10.1016/s1473-3099(09)70282-8',
          title: 'An author manuscript',
          authorString: 'Dooley K, Chaisson R',
          journalTitle: 'The Lancet Infectious Diseases',
          pubYear: '2009',
          abstractText: 'A short abstract.',
          // Europe PMC marks author manuscripts as not held by it.
          inEPMC: 'N',
          isOpenAccess: 'N',
        },
      ],
    },
  };

  it('no longer stops at the abstract when Europe PMC says it holds nothing', async () => {
    routeFetch({
      '/search?': { body: JSON.stringify(record) },
      'fullTextXML': { status: 404 },
      'efetch.fcgi?db=pmc': { body: BODY },
    });
    const result = await lookupPaper({ kind: 'doi', value: '10.1016/S1473-3099(09)70282-8' });
    expect(result.fullText).toBe(true);
    expect(result.openAccessNote).toMatch(/PubMed Central/);
    expect(result.markdown).toContain('## Methods');
    expect(result.markdown).toContain('PubMed Central full text (JATS)');
  });

  it('still falls back to the abstract when PMC holds only a citation', async () => {
    routeFetch({
      '/search?': { body: JSON.stringify(record) },
      'fullTextXML': { status: 404 },
      'efetch.fcgi?db=pmc': { body: STUB },
      'efetch.fcgi?db=pubmed': { status: 404 },
    });
    const result = await lookupPaper({ kind: 'doi', value: '10.1016/S1473-3099(09)70282-8' });
    expect(result.fullText).toBe(false);
    expect(result.markdown).toContain('A short abstract.');
  });

  it('keeps a body that has no titled sections instead of dropping to the abstract', async () => {
    routeFetch({
      '/search?': {
        body: JSON.stringify({
          resultList: {
            result: [{ pmid: '42508976', pmcid: 'PMC13259578', title: 'A letter with no sections', abstractText: 'A short abstract.' }],
          },
        }),
      },
      'fullTextXML': { body: LETTER },
    });
    const result = await lookupPaper({ kind: 'pmid', value: '42508976' });
    expect(result.fullText).toBe(true);
    expect(result.markdown).toContain('The health system needs more than resilience.');
  });
});

describe('open-access PDF fallback', () => {
  const heisler = {
    resultList: {
      result: [
        {
          pmid: '8662850',
          doi: '10.1074/jbc.271.24.14572',
          title: 'Amino acid substitutions in RNA polymerase',
          authorString: 'Heisler L, Feng G, Jin D, Gross C, Landick R',
          journalTitle: 'Journal of Biological Chemistry',
          pubYear: '1996',
          abstractText: `${'Rho-dependent termination and RNA polymerase elongation are coupled. '.repeat(8)}`,
          isOpenAccess: 'N',
          inEPMC: 'N',
          hasPDF: 'N',
          fullTextUrlList: {
            fullTextUrl: [
              {
                availabilityCode: 'OA',
                documentStyle: 'pdf',
                site: 'Unpaywall',
                url: 'http://www.jbc.org/article/S002192581846838X/pdf',
              },
            ],
          },
        },
      ],
    },
  };

  it('upgrades http Unpaywall links and ignores subscription DOIs', () => {
    const urls = openAccessPdfUrls(heisler.resultList.result[0], undefined);
    expect(urls).toEqual(['https://www.jbc.org/article/S002192581846838X/pdf']);
  });

  it('does not treat a Cloudflare HTML wall as the full paper', async () => {
    routeFetch({
      '/search?': { body: JSON.stringify(heisler) },
      'jbc.org': { body: '<!DOCTYPE html><html>Just a moment...</html>', contentType: 'text/html' },
    });
    const result = await lookupPaper({ kind: 'pmid', value: '8662850' });
    expect(result.fullText).toBe(false);
    expect(result.openAccessNote).toMatch(/browser wall/i);
    expect(result.markdown).toContain('Rho-dependent termination');
    expect(result.markdown).toMatch(/PubMed abstract/);
  });
});
