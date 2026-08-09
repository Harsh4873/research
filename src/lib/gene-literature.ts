import type { Gene } from './gene-catalog';

/**
 * What has been published about a gene.
 *
 * Gene symbols are terrible search terms on their own — `far`, `smc`, `pks`
 * and `relA` all mean something else outside mycobacteriology — so every
 * query pairs the identifiers with the organism. The locus tag is the reliable
 * half (nothing else is called Rv0290), and the symbol is the half that finds
 * the papers written before the locus tag was in common use.
 */

const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest';

export interface LiteratureItem {
  id: string;
  source: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title: string;
  authors: string;
  journal: string;
  year: string;
  citations: number;
  isPreprint: boolean;
  hasFullText: boolean;
  abstract?: string;
}

export interface LiteratureResult {
  /** Total matching records, which is the ranking signal. */
  total: number;
  items: LiteratureItem[];
}

/**
 * The Europe PMC query for a gene. Exported because it is the whole heuristic.
 *
 * `scope: 'title-abstract'` is what counts are measured on: searching full
 * text matches every paper that lists the gene once in a supplementary table,
 * which turns relA from 214 papers into 10,390 and makes the signal useless.
 * `scope: 'full-text'` is the wider net, used when the precise query finds
 * nothing — for an obscure locus the only mentions are inside the text.
 */
export type QueryScope = 'title-abstract' | 'full-text';

export function geneQuery(gene: Gene, scope: QueryScope = 'title-abstract'): string {
  const names = [gene.orf];
  if (gene.gene && gene.gene.toLowerCase() !== gene.orf.toLowerCase()) names.push(gene.gene);
  const field = scope === 'title-abstract' ? 'TITLE_ABS:' : '';
  const any = names.map((name) => `${field}"${name}"`).join(' OR ');
  return `(${any}) AND (tuberculosis OR mycobacterium)`;
}

interface EpmcResult {
  id?: string;
  source?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  journalTitle?: string;
  pubYear?: string;
  citedByCount?: number;
  hasTextMinedTerms?: string;
  inEPMC?: string;
  isOpenAccess?: string;
  abstractText?: string;
  bookOrReportDetails?: unknown;
}

function toItem(result: EpmcResult): LiteratureItem {
  return {
    id: result.id ?? result.pmid ?? result.doi ?? Math.random().toString(36).slice(2),
    source: result.source ?? 'MED',
    pmid: result.pmid,
    pmcid: result.pmcid,
    doi: result.doi,
    title: (result.title ?? 'Untitled').replace(/\.$/, ''),
    authors: result.authorString ?? '',
    journal: result.journalTitle ?? '',
    year: result.pubYear ?? '',
    citations: typeof result.citedByCount === 'number' ? result.citedByCount : 0,
    isPreprint: result.source === 'PPR',
    hasFullText: result.inEPMC === 'Y' || Boolean(result.pmcid),
    abstract: result.abstractText,
  };
}

async function search(query: string, pageSize: number, signal?: AbortSignal, sort?: string): Promise<LiteratureResult> {
  const params = new URLSearchParams({
    query,
    format: 'json',
    resultType: pageSize > 0 ? 'core' : 'idlist',
    pageSize: String(Math.max(1, pageSize)),
  });
  if (sort) params.set('sort', sort);
  const response = await fetch(`${EPMC}/search?${params.toString()}`, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Europe PMC replied ${response.status}.`);
  const payload = (await response.json()) as { hitCount?: number; resultList?: { result?: EpmcResult[] } };
  return {
    total: typeof payload.hitCount === 'number' ? payload.hitCount : 0,
    items: pageSize > 0 ? (payload.resultList?.result ?? []).map(toItem) : [],
  };
}

/** How many papers mention this gene. Cheap: one request, no records returned. */
export async function literatureCount(gene: Gene, signal?: AbortSignal): Promise<number> {
  const result = await search(geneQuery(gene), 1, signal);
  return result.total;
}

export interface GeneLiterature extends LiteratureResult {
  query: string;
  scope: QueryScope;
  /** True when the precise search found nothing and the wider one was used. */
  widened: boolean;
}

/** The papers themselves, most cited first, for the gene panel. */
export async function geneLiterature(
  gene: Gene,
  options: { limit?: number; signal?: AbortSignal; sort?: 'cited' | 'recent' } = {},
): Promise<GeneLiterature> {
  const limit = options.limit ?? 25;
  const sort = options.sort === 'recent' ? 'P_PDATE_D desc' : 'CITED desc';

  const precise = geneQuery(gene, 'title-abstract');
  const first = await search(precise, limit, options.signal, sort);
  if (first.items.length > 0) return { ...first, query: precise, scope: 'title-abstract', widened: false };

  // Nothing names this gene in a title or abstract, which is common for a
  // locus nobody has written a paper about. Look inside the text instead.
  const wide = geneQuery(gene, 'full-text');
  const second = await search(wide, limit, options.signal, sort);
  return { ...second, query: wide, scope: 'full-text', widened: true };
}

/**
 * Counts for many genes at once, a few requests at a time.
 *
 * Ranking the whole genome on live counts would be 4,018 requests, so the Lab
 * ranks on the offline signals first and pulls literature for the shortlist —
 * enough for the signal to re-order what is already worth looking at.
 */
export async function literatureCounts(
  genes: Gene[],
  options: { concurrency?: number; signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const queue = [...genes];
  const total = queue.length;
  let done = 0;

  const worker = async () => {
    for (;;) {
      const gene = queue.shift();
      if (!gene) return;
      try {
        counts.set(gene.orf, await literatureCount(gene, options.signal));
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
        // A gene whose count failed stays absent, which the ranking reads as
        // "no data" rather than as zero papers.
      }
      done += 1;
      options.onProgress?.(done, total);
    }
  };

  const lanes = Math.max(1, Math.min(options.concurrency ?? 4, 8));
  await Promise.all(Array.from({ length: lanes }, worker));
  return counts;
}
