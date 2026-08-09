import type { Gene } from './gene-catalog';

/**
 * Find a gene the way a person names one: by symbol (`eccD3`), by locus
 * (`Rv0205`), or by what it does (`alpha-mannosidase`, `ESX-3 secretion`).
 * Where a term matched sets the rank, so an exact symbol never loses to a
 * gene that merely mentions it in its product description.
 */

export interface GeneHit {
  gene: Gene;
  score: number;
  /** Which field carried the strongest match, for the result list. */
  matched: 'orf' | 'symbol' | 'annotation';
}

const norm = (value: string) => value.toLowerCase().trim();

/** `rv0205`, `RV 0205` and `Rv0205c` all name the same locus family. */
function orfKey(value: string): string {
  return norm(value).replace(/\s+/g, '');
}

export function searchGenes(genes: Gene[], query: string, limit = 25): GeneHit[] {
  const raw = query.trim();
  if (!raw) return [];
  const q = norm(raw);
  const qOrf = orfKey(raw);
  const terms = q.split(/\s+/).filter(Boolean);
  const hits: GeneHit[] = [];

  for (const gene of genes) {
    const orf = norm(gene.orf);
    const symbol = gene.gene ? norm(gene.gene) : '';
    const annotation = norm(gene.annotation);

    let score = 0;
    let matched: GeneHit['matched'] = 'annotation';

    if (orfKey(gene.orf) === qOrf) {
      score = 1000;
      matched = 'orf';
    } else if (symbol && symbol === q) {
      score = 900;
      matched = 'symbol';
    } else if (symbol && symbol.startsWith(q)) {
      score = 600 - symbol.length;
      matched = 'symbol';
    } else if (orf.startsWith(qOrf)) {
      score = 500;
      matched = 'orf';
    } else if (symbol && symbol.includes(q)) {
      score = 300;
      matched = 'symbol';
    } else if (terms.length > 0 && terms.every((term) => annotation.includes(term))) {
      // Every word has to appear, so extra words narrow rather than widen.
      score = 120 - Math.min(60, annotation.length / 20);
      matched = 'annotation';
    }

    if (score > 0) hits.push({ gene, score, matched });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.gene.orf.localeCompare(b.gene.orf, undefined, { numeric: true }))
    .slice(0, limit);
}

/** Resolve a single name to one gene, for a deep link or a pasted symbol. */
export function findGene(genes: Gene[], query: string): Gene | null {
  const hits = searchGenes(genes, query, 1);
  return hits.length > 0 && hits[0].score >= 500 ? hits[0].gene : null;
}
