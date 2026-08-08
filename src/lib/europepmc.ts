import { europePmcQuery, normalizePmcid, type PaperId } from './paper-id';
import { buildFrontMatter, citationLine, jatsToMarkdown, mineAbbreviations, type PaperConversion, type PaperMeta } from './jats';
import { htmlToMarkdown, structuredAbstractParts } from './html-text';

const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest';
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

export interface EpmcRecord {
  id?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  journalTitle?: string;
  pubYear?: string;
  abstractText?: string;
  isOpenAccess?: string;
  inEPMC?: string;
  hasSuppl?: string;
  keywordList?: { keyword?: string[] };
  journalInfo?: { journal?: { title?: string }; yearOfPublication?: number };
  fullTextUrlList?: { fullTextUrl?: Array<{ url?: string; documentStyle?: string; site?: string }> };
}

export class PaperLookupError extends Error {
  readonly hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'PaperLookupError';
    this.hint = hint;
  }
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new PaperLookupError(`The lookup service replied ${response.status}.`);
  return response.json();
}

async function getText(url: string, signal?: AbortSignal): Promise<string | null> {
  const response = await fetch(url, { signal });
  if (response.status === 404) return null;
  if (!response.ok) return null;
  return response.text();
}

/** Look up article metadata in Europe PMC. */
export async function searchEuropePmc(id: PaperId, signal?: AbortSignal): Promise<EpmcRecord | null> {
  const url = `${EPMC}/search?query=${encodeURIComponent(europePmcQuery(id))}&resultType=core&format=json&pageSize=1`;
  const payload = (await getJson(url, signal)) as { resultList?: { result?: EpmcRecord[] } };
  return payload.resultList?.result?.[0] ?? null;
}

/** NCBI esummary, used when Europe PMC has no record for a PMID. */
async function ncbiSummary(pmid: string, signal?: AbortSignal): Promise<EpmcRecord | null> {
  const url = `${EUTILS}/esummary.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=json`;
  const payload = (await getJson(url, signal).catch(() => null)) as
    | { result?: Record<string, unknown> }
    | null;
  const entry = payload?.result?.[pmid] as
    | { title?: string; fulljournalname?: string; source?: string; pubdate?: string; authors?: Array<{ name?: string }>; elocationid?: string; articleids?: Array<{ idtype?: string; value?: string }> }
    | undefined;
  if (!entry?.title) return null;
  const doi = entry.articleids?.find((a) => a.idtype === 'doi')?.value;
  const pmcid = entry.articleids?.find((a) => a.idtype === 'pmcid')?.value;
  return {
    pmid,
    doi,
    pmcid: pmcid ? normalizePmcid(pmcid) : undefined,
    title: entry.title.replace(/\.$/, ''),
    authorString: (entry.authors ?? []).map((a) => a.name).filter(Boolean).join(', '),
    journalTitle: entry.fulljournalname ?? entry.source,
    pubYear: (entry.pubdate ?? '').match(/\d{4}/)?.[0],
  };
}

/** Fetch NCBI's abstract text for records Europe PMC only knows by title. */
async function ncbiAbstract(pmid: string, signal?: AbortSignal): Promise<string | undefined> {
  const url = `${EUTILS}/efetch.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&rettype=abstract&retmode=text`;
  const text = await getText(url, signal).catch(() => null);
  if (!text) return undefined;
  // The plain-text record puts the abstract between the author list and the
  // trailing metadata lines; keep the longest paragraph as a safe heuristic.
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 180 && !/^(Author information|DOI|PMID|PMCID|Conflict of interest)/i.test(part));
  const best = paragraphs.sort((a, b) => b.length - a.length)[0];
  return best;
}

/** True when the document carries an article body, not just front matter. */
export function hasArticleBody(xml: string): boolean {
  const body = xml.search(/<body[\s>]/);
  if (body === -1) return false;
  // An empty <body/> or one holding only whitespace is not full text.
  return /<body[\s>][\s\S]{200,}?<\/body>/.test(xml);
}

export interface FullTextSource {
  xml: string;
  /** Which archive served it, for the provenance line. */
  from: 'europepmc' | 'pmc';
}

export async function fetchFullTextXml(pmcid: string, signal?: AbortSignal): Promise<string | null> {
  const xml = await getText(`${EPMC}/${normalizePmcid(pmcid)}/fullTextXML`, signal);
  if (!xml || !xml.includes('<article')) return null;
  return xml;
}

/**
 * NCBI's copy of the same article.
 *
 * Europe PMC does not serve `fullTextXML` for author manuscripts (the NIHMS
 * and EMS deposits), and those are a large slice of clinical literature: for
 * them Europe PMC answers with nothing while NCBI returns the complete JATS.
 * Asking both is the difference between an abstract and the paper.
 */
export async function fetchPmcFullTextXml(pmcid: string, signal?: AbortSignal): Promise<string | null> {
  const id = normalizePmcid(pmcid).replace(/^PMC/i, '');
  if (!id) return null;
  const xml = await getText(`${EUTILS}/efetch.fcgi?db=pmc&id=${encodeURIComponent(id)}&retmode=xml`, signal);
  if (!xml || !xml.includes('<article')) return null;
  return xml;
}

/** The best full text either archive has for this article, or null. */
export async function fetchAnyFullTextXml(pmcid: string, signal?: AbortSignal): Promise<FullTextSource | null> {
  const epmc = await fetchFullTextXml(pmcid, signal).catch(() => null);
  if (epmc && hasArticleBody(epmc)) return { xml: epmc, from: 'europepmc' };
  const ncbi = await fetchPmcFullTextXml(pmcid, signal).catch(() => null);
  if (ncbi && hasArticleBody(ncbi)) return { xml: ncbi, from: 'pmc' };
  // Neither carried a body; the Europe PMC copy is still the better metadata.
  if (epmc) return { xml: epmc, from: 'europepmc' };
  return null;
}

function metaFromRecord(record: EpmcRecord): PaperMeta {
  const authors = (record.authorString ?? '')
    .split(/,\s*/)
    .map((name) => name.replace(/\.$/, '').trim())
    .filter(Boolean);
  return {
    title: (record.title ?? 'Untitled paper').replace(/\.$/, ''),
    authors,
    journal: record.journalTitle ?? record.journalInfo?.journal?.title,
    year: record.pubYear ?? (record.journalInfo?.yearOfPublication?.toString() || undefined),
    doi: record.doi,
    pmid: record.pmid,
    pmcid: record.pmcid ? normalizePmcid(record.pmcid) : undefined,
    keywords: record.keywordList?.keyword ?? [],
  };
}

/** Build abstract-only markdown when no open-access full text exists. */
export function abstractOnlyMarkdown(meta: PaperMeta, abstractText: string | undefined, note: string): PaperConversion {
  const out: string[] = [
    buildFrontMatter(meta, { source: note }),
    `# ${meta.title}`,
    citationLine(meta),
  ];
  if (meta.keywords.length > 0) out.push(`_This paper is indexed under ${meta.keywords.join(', ')}._`);

  const raw = (abstractText ?? '').trim();
  // PubMed structured abstracts arrive as HTML (`<h4>Background</h4>…`).
  const clean = raw ? htmlToMarkdown(raw).replace(/\s+/g, ' ').trim() : '';
  if (clean) {
    out.push('## Abstract');
    const parts = structuredAbstractParts(raw);
    if (parts.length >= 2) {
      for (const part of parts) out.push(`- **${part.label}**: ${part.body.replace(/\s+/g, ' ')}`);
    } else {
      out.push(clean);
    }

    const abbreviations = mineAbbreviations(clean);
    if (abbreviations.length >= 2) {
      out.push('## Glossary');
      out.push(abbreviations.join('\n'));
    }
  }

  // A blockquote rather than a section: an availability notice is not study
  // material, and a heading here would become a flashcard.
  out.push(
    [
      '>',
      clean
        ? 'Only the abstract is machine-readable for this article, so this set covers the abstract and metadata.'
        : 'No abstract is available for this record, so this set covers the metadata only.',
      meta.doi ? `Full article: https://doi.org/${meta.doi}` : '',
      meta.pmid ? `PubMed: https://pubmed.ncbi.nlm.nih.gov/${meta.pmid}/` : '',
      'To study the whole paper, download the publisher PDF and drop it on the Review tab.',
    ]
      .filter(Boolean)
      .join(' '),
  );

  return {
    meta,
    markdown: out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n',
    counts: { sections: clean ? 1 : 0, tables: 0, figures: 0, equations: 0, supplements: 0, references: 0 },
  };
}

export interface LookupResult extends PaperConversion {
  /** Whether the machine-readable full text was available. */
  fullText: boolean;
  openAccessNote: string;
}

/** Resolve an identifier all the way to study markdown. */
export async function lookupPaper(id: PaperId, signal?: AbortSignal): Promise<LookupResult> {
  let record: EpmcRecord | null = null;
  try {
    record = await searchEuropePmc(id, signal);
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    record = null;
  }

  if (!record && id.kind === 'pmid') record = await ncbiSummary(id.value, signal);

  if (!record) {
    throw new PaperLookupError(
      'No article matched that identifier.',
      'Check the PMID, PMCID, or DOI — or upload the PDF instead.',
    );
  }

  const meta = metaFromRecord(record);
  if (id.kind === 'pmcid' && !meta.pmcid) meta.pmcid = normalizePmcid(id.value);
  if (id.kind === 'doi' && !meta.doi) meta.doi = id.value;
  if (id.kind === 'pmid' && !meta.pmid) meta.pmid = id.value;

  const pmcid = meta.pmcid;
  // Try whenever the article has a PMC identifier at all. `inEPMC: N` is
  // exactly the author-manuscript case, where Europe PMC holds no full text
  // but NCBI does, so gating on it was throwing away the papers most likely
  // to be recoverable.
  if (pmcid) {
    const source = await fetchAnyFullTextXml(pmcid, signal).catch(() => null);
    if (source) {
      const archive = source.from === 'pmc' ? 'PubMed Central' : 'Europe PMC';
      const converted = jatsToMarkdown(source.xml, {
        pmid: meta.pmid,
        pmcid,
        doi: meta.doi,
        sourceNote: `${archive} full text (JATS) · ${pmcid}`,
      });
      if (converted && converted.counts.sections > 0) {
        // Prefer search metadata for fields the XML leaves blank.
        converted.meta = {
          ...converted.meta,
          journal: converted.meta.journal ?? meta.journal,
          year: converted.meta.year ?? meta.year,
          authors: converted.meta.authors.length > 0 ? converted.meta.authors : meta.authors,
          keywords: converted.meta.keywords.length > 0 ? converted.meta.keywords : meta.keywords,
        };
        return {
          ...converted,
          fullText: true,
          openAccessNote:
            source.from === 'pmc'
              ? 'Full text from PubMed Central (author manuscript or open access).'
              : 'Full text from Europe PMC (open access).',
        };
      }
    }
  }

  let abstractText = record.abstractText;
  if (!abstractText && meta.pmid) abstractText = await ncbiAbstract(meta.pmid, signal).catch(() => undefined);

  const conversion = abstractOnlyMarkdown(
    meta,
    abstractText,
    meta.pmid ? `PubMed abstract · PMID ${meta.pmid}` : 'PubMed abstract',
  );
  return {
    ...conversion,
    fullText: false,
    openAccessNote: pmcid
      ? 'Only the abstract is machine-readable for this article.'
      : 'This article is not open access, so only the abstract is available.',
  };
}
