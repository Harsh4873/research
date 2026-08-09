import { isEnvelope, unlock, type Envelope } from './lockbox';

/**
 * The Genes tab reads its two datasets from the sibling MtbScope site rather
 * than carrying copies: the H37Rv catalog is public, and the differential
 * selection results are the same encrypted file that site publishes. Both are
 * served from the same origin under `/genes/`, so this is a plain fetch, and
 * neither dataset drifts out of step with the site that maintains it.
 */
/**
 * The data sits beside this app, not inside it: `/research/` is the app and
 * `/genes/data/` is the sibling site, so resolve against this app's parent.
 */
export function siblingUrl(file: string, base = import.meta.env.BASE_URL || '/'): string {
  const parent = base.endsWith('/') ? base.replace(/[^/]+\/$/, '') : '/';
  return `${parent || '/'}genes/data/${file}`;
}

export type GeneCategory =
  | 'information'
  | 'cell-wall'
  | 'metabolism'
  | 'lipid'
  | 'virulence'
  | 'regulatory'
  | 'pe-ppe'
  | 'insertion-phage'
  | 'stable-rna'
  | 'hypothetical'
  | 'unclassified';

export interface Gene {
  orf: string;
  gene: string | null;
  /** Symbol when there is one, else the Rv id. */
  name: string;
  start: number;
  end: number;
  strand: '+' | '-';
  /** Protein length in amino acids. */
  length: number;
  annotation: string;
  category: GeneCategory;
}

export interface GeneCatalog {
  organism: string;
  source: string;
  count: number;
  genes: Gene[];
  byOrf: Map<string, Gene>;
}

export class GeneDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeneDataError';
  }
}

const CATEGORIES = new Set<string>([
  'information',
  'cell-wall',
  'metabolism',
  'lipid',
  'virulence',
  'regulatory',
  'pe-ppe',
  'insertion-phage',
  'stable-rna',
  'hypothetical',
  'unclassified',
]);

export const CATEGORY_LABEL: Record<GeneCategory, string> = {
  information: 'Information pathways',
  'cell-wall': 'Cell wall and processes',
  metabolism: 'Metabolism and respiration',
  lipid: 'Lipid metabolism',
  virulence: 'Virulence and stress',
  regulatory: 'Regulatory proteins',
  'pe-ppe': 'PE / PPE family',
  'insertion-phage': 'Insertion sequences and phage',
  'stable-rna': 'Stable RNA',
  hypothetical: 'Conserved hypothetical',
  unclassified: 'Unclassified',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateCatalog(value: unknown): GeneCatalog {
  if (!isRecord(value) || !Array.isArray(value.genes)) {
    throw new GeneDataError('The gene catalog is not in the expected format.');
  }
  const genes: Gene[] = [];
  for (const raw of value.genes) {
    if (!isRecord(raw)) continue;
    const orf = typeof raw.o === 'string' ? raw.o.trim() : '';
    if (!orf) continue;
    const category = typeof raw.c === 'string' && CATEGORIES.has(raw.c) ? (raw.c as GeneCategory) : 'unclassified';
    const symbol = typeof raw.g === 'string' && raw.g.trim() ? raw.g.trim() : null;
    genes.push({
      orf,
      gene: symbol,
      name: symbol ?? orf,
      start: typeof raw.s === 'number' ? raw.s : 0,
      end: typeof raw.e === 'number' ? raw.e : 0,
      strand: raw.d === '-' ? '-' : '+',
      length: typeof raw.l === 'number' ? raw.l : 0,
      annotation: typeof raw.a === 'string' ? raw.a : '',
      category,
    });
  }
  if (genes.length === 0) throw new GeneDataError('The gene catalog is empty.');

  const byOrf = new Map<string, Gene>();
  for (const gene of genes) byOrf.set(gene.orf, gene);
  return {
    organism: typeof value.organism === 'string' ? value.organism : 'Mycobacterium tuberculosis H37Rv',
    source: typeof value.source === 'string' ? value.source : 'H37Rv reference annotation',
    count: genes.length,
    genes,
    byOrf,
  };
}

let catalogPromise: Promise<GeneCatalog> | null = null;

export function resetGeneCaches(): void {
  catalogPromise = null;
  selectionEnvelope = null;
  unlockedSelection = null;
}

export function loadGeneCatalog(): Promise<GeneCatalog> {
  if (catalogPromise) return catalogPromise;
  const request = fetch(siblingUrl('genes.json'))
    .then((response) => {
      if (!response.ok) throw new GeneDataError(`The gene catalog could not be loaded (${response.status}).`);
      return response.json() as Promise<unknown>;
    })
    .then(validateCatalog);
  catalogPromise = request;
  void request.catch(() => {
    if (catalogPromise === request) catalogPromise = null;
  });
  return request;
}

/* ------------------------------------------------------------------ *
 * Selection signals, published encrypted by the sibling site
 * ------------------------------------------------------------------ */

export interface GeneSelection {
  orf: string;
  /** P(omega_DB > omega_NDB) from the posterior comparison. */
  dpd: number | null;
  omegaDb: number | null;
  omegaNdb: number | null;
  /** Distinct alleles across the pooled isolates. */
  alleles: number | null;
  /** Difference of log2 pN/pS, diabetes minus non-diabetes. */
  deltaLog2: number | null;
  /** Signed likelihood-ratio statistic from the branch model. */
  signed2LL: number | null;
  chiSq: number | null;
}

export interface SelectionData {
  cohorts: { db: number; ndb: number; total: number };
  byOrf: Map<string, GeneSelection>;
}

let selectionEnvelope: Promise<Envelope> | null = null;
let unlockedSelection: SelectionData | null = null;

export function unlockedSelectionData(): SelectionData | null {
  return unlockedSelection;
}

function fetchSelectionEnvelope(): Promise<Envelope> {
  if (selectionEnvelope) return selectionEnvelope;
  const request = fetch(siblingUrl('selection.enc'))
    .then((response) => {
      if (!response.ok) throw new GeneDataError(`The selection dataset could not be loaded (${response.status}).`);
      return response.json() as Promise<unknown>;
    })
    .then((value) => {
      if (!isEnvelope(value)) throw new GeneDataError('The selection dataset is not in the expected format.');
      return value;
    });
  selectionEnvelope = request;
  void request.catch(() => {
    if (selectionEnvelope === request) selectionEnvelope = null;
  });
  return request;
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export function parseSelection(payload: unknown): SelectionData {
  if (!isRecord(payload) || !Array.isArray(payload.genes)) {
    throw new GeneDataError('The decrypted selection dataset is not in the expected format.');
  }
  const cohortsRaw = isRecord(payload.metadata) && isRecord(payload.metadata.cohorts) ? payload.metadata.cohorts : {};
  const byOrf = new Map<string, GeneSelection>();
  for (const raw of payload.genes) {
    if (!isRecord(raw) || typeof raw.o !== 'string') continue;
    byOrf.set(raw.o, {
      orf: raw.o,
      dpd: num(raw.dpd),
      omegaDb: num(raw.wd),
      omegaNdb: num(raw.wn),
      alleles: num(raw.al),
      deltaLog2: num(raw.dl),
      signed2LL: num(raw.pll),
      chiSq: num(raw.x2),
    });
  }
  if (byOrf.size === 0) throw new GeneDataError('The decrypted selection dataset has no genes.');
  return {
    cohorts: {
      db: num(cohortsRaw.db) ?? 0,
      ndb: num(cohortsRaw.ndb) ?? 0,
      total: num(cohortsRaw.total) ?? 0,
    },
    byOrf,
  };
}

/** Decrypt the published selection dataset. Throws LockedError on a bad passphrase. */
export async function loadSelectionData(passphrase: string): Promise<SelectionData> {
  if (unlockedSelection) return unlockedSelection;
  const envelope = await fetchSelectionEnvelope();
  const json = await unlock(envelope, passphrase);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new GeneDataError('The decrypted selection dataset is not valid JSON.');
  }
  unlockedSelection = parseSelection(parsed);
  return unlockedSelection;
}
