import { europePmcQuery, normalizePmcid, type PaperId } from './paper-id';
import { buildFrontMatter, citationLine, jatsToMarkdown, mineAbbreviations, type PaperConversion, type PaperMeta } from './jats';

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

export async function fetchFullTextXml(pmcid: string, signal?: AbortSignal): Promise<string | null> {
  const xml = await getText(`${EPMC}/${normalizePmcid(pmcid)}/fullTextXML`, signal);
  if (!xml || !xml.includes('<article')) return null;
  return xml;
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

  const clean = (abstractText ?? '').replace(/\s+/g, ' ').trim();
  if (clean) {
    out.push('## Abstract');
    // Structured abstracts use "BACKGROUND: ..." run-in headings; split them
    // into labelled bullets so they become study cards.
    const structured = clean.match(/([A-Z][A-Z /&-]{3,40}):\s/g);
    if (structured && structured.length >= 2) {
      const parts = clean.split(/(?=[A-Z][A-Z /&-]{3,40}:\s)/).filter(Boolean);
      for (const part of parts) {
        const match = part.match(/^([A-Z][A-Z /&-]{3,40}):\s*([\s\S]+)$/);
        if (match) {
          const label = match[1].trim().replace(/\s+/g, ' ');
          const body = match[2].replace(/\s+/g, ' ').trim();
          const pretty = label.charAt(0) + label.slice(1).toLowerCase();
          out.push(`- **${pretty}**: ${body}`);
        } else {
          out.push(part.trim());
        }
      }
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
  if (pmcid && record.inEPMC !== 'N') {
    const xml = await fetchFullTextXml(pmcid, signal).catch(() => null);
    if (xml) {
      const converted = jatsToMarkdown(xml, {
        pmid: meta.pmid,
        pmcid,
        doi: meta.doi,
        sourceNote: `Europe PMC full text (JATS) · ${pmcid}`,
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
          openAccessNote: 'Full text from Europe PMC (open access).',
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
