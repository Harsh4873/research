import type { Gene, GeneCategory, GeneSelection, SelectionData } from './gene-catalog';

/**
 * GenePrioritize — rank genes worth investigating.
 *
 * Every signal is normalised to 0..1 and multiplied by a weight you control,
 * so the ranking is a stated opinion rather than a black box: the panel shows
 * what each signal contributed, and a signal with no data contributes nothing
 * instead of quietly counting as zero (which would punish genes for gaps in
 * the evidence rather than for the evidence itself).
 */

export const SIGNALS = [
  'omega',
  'significance',
  'mutations',
  'cohort',
  'literature',
  'pathway',
  'annotation',
] as const;

export type SignalId = (typeof SIGNALS)[number];

export type Weights = Record<SignalId, number>;

export const SIGNAL_META: Record<SignalId, { label: string; help: string }> = {
  omega: {
    label: 'Selection strength (ω)',
    help: 'Posterior mean dN/dS in the diabetes cohort. Above 1 means nonsynonymous change is outrunning synonymous change.',
  },
  significance: {
    label: 'Statistical significance',
    help: 'How far the posterior comparison (DPD) sits from "no difference", supported by the branch-model likelihood ratio where the gene could be fitted.',
  },
  mutations: {
    label: 'Mutation count',
    help: 'Distinct alleles observed across the pooled isolates. A ratio estimated from few observations is not worth much.',
  },
  cohort: {
    label: 'Cohort difference',
    help: 'Difference of log2 pN/pS between cohorts — the count-based read on the same comparison.',
  },
  literature: {
    label: 'Literature volume',
    help: 'How much has been published on this gene. Weight it up to build on existing work, or down to look where nobody has.',
  },
  pathway: {
    label: 'Pathway interest',
    help: 'Boosts the functional classes you are interested in — cell wall, virulence and stress, lipid metabolism by default.',
  },
  annotation: {
    label: 'Annotation confidence',
    help: 'How well characterised the gene is. A named gene with a specific product scores high; "conserved hypothetical" scores low.',
  },
};

export const DEFAULT_WEIGHTS: Weights = {
  omega: 1,
  significance: 1,
  mutations: 0.75,
  cohort: 0.5,
  literature: 0.25,
  pathway: 0.5,
  annotation: 0.25,
};

/** Functional classes boosted by the pathway signal, and by how much. */
export const DEFAULT_PATHWAYS: GeneCategory[] = ['cell-wall', 'virulence', 'lipid'];

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Annotation confidence, read off the product description. Curators hedge in
 * a consistent vocabulary — "probable", "possible", "conserved hypothetical" —
 * and that hedging is the signal.
 */
export function annotationConfidence(gene: Gene): number {
  const text = gene.annotation.toLowerCase();
  if (!text) return 0.1;
  if (/(hypothetical|unknown function|uncharacteri[sz]ed)/.test(text)) return gene.gene ? 0.25 : 0.1;
  if (/^possible\b/.test(text)) return 0.45;
  if (/^(probable|putative)\b/.test(text)) return 0.6;
  if (/^conserved (protein|membrane protein|exported protein)/.test(text)) return 0.2;
  return gene.gene ? 1 : 0.8;
}

/** Literature counts arrive asynchronously, so they are supplied separately. */
export type LiteratureCounts = Map<string, number>;

export interface PriorityInput {
  genes: Gene[];
  selection: SelectionData | null;
  literature?: LiteratureCounts;
  weights: Weights;
  pathways?: GeneCategory[];
}

export interface SignalScore {
  id: SignalId;
  /** 0..1, or null when this gene has no data for the signal. */
  value: number | null;
  weight: number;
  contribution: number;
}

export interface RankedGene {
  gene: Gene;
  selection: GeneSelection | null;
  literature: number | null;
  /** 0..100, the weighted mean over the signals that had data. */
  score: number;
  signals: SignalScore[];
  /** Signals that had no data for this gene, named so the gap is visible. */
  missing: SignalId[];
}

/** log1p compression, so one very well-studied gene cannot flatten the rest. */
function logScale(value: number, ceiling: number): number {
  if (!(value > 0)) return 0;
  return clamp01(Math.log1p(value) / Math.log1p(ceiling));
}

function signalValues(
  gene: Gene,
  selection: GeneSelection | null,
  literature: number | null,
  pathways: Set<GeneCategory>,
  literatureCeiling: number,
): Record<SignalId, number | null> {
  const dpd = selection?.dpd ?? null;
  const omega = selection?.omegaDb ?? null;
  const alleles = selection?.alleles ?? null;
  const delta = selection?.deltaLog2 ?? null;
  const lrt = selection?.signed2LL ?? null;

  // Significance is distance from "the cohorts are indistinguishable" in
  // either direction, so a strongly constrained gene ranks as interesting too.
  let significance: number | null = dpd === null ? null : clamp01(Math.abs(dpd - 0.5) * 2);
  if (significance !== null && lrt !== null) {
    // The branch model agreeing lifts a gene; it cannot rescue one on its own.
    significance = clamp01(significance * 0.8 + clamp01(Math.abs(lrt) / 7) * 0.2);
  }

  return {
    omega: omega === null ? null : clamp01(omega / 2.5),
    significance,
    mutations: alleles === null ? null : logScale(alleles, 60),
    cohort: delta === null ? null : clamp01(Math.abs(delta) / 3),
    literature: literature === null ? null : logScale(literature, literatureCeiling),
    pathway: pathways.size === 0 ? null : pathways.has(gene.category) ? 1 : 0.15,
    annotation: annotationConfidence(gene),
  };
}

export function rankGenes(input: PriorityInput): RankedGene[] {
  const pathways = new Set(input.pathways ?? DEFAULT_PATHWAYS);
  const literature = input.literature;
  // Scale literature against the busiest gene in view, so the signal spreads
  // across whatever set is being ranked instead of a fixed guess.
  const ceiling = Math.max(25, ...(literature ? [...literature.values()] : [0]));

  const ranked: RankedGene[] = input.genes.map((gene) => {
    const selection = input.selection?.byOrf.get(gene.orf) ?? null;
    const papers = literature?.get(gene.orf) ?? null;
    const values = signalValues(gene, selection, papers, pathways, ceiling);

    const signals: SignalScore[] = [];
    const missing: SignalId[] = [];
    let weighted = 0;
    let totalWeight = 0;

    for (const id of SIGNALS) {
      const weight = Math.max(0, input.weights[id] ?? 0);
      const value = values[id];
      if (value === null) {
        if (weight > 0) missing.push(id);
        signals.push({ id, value: null, weight, contribution: 0 });
        continue;
      }
      const contribution = value * weight;
      signals.push({ id, value, weight, contribution });
      if (weight > 0) {
        weighted += contribution;
        totalWeight += weight;
      }
    }

    return {
      gene,
      selection,
      literature: papers,
      // A weighted mean over the signals that had data: a gene is not punished
      // for a signal nobody measured, only for the ones it scores low on.
      score: totalWeight > 0 ? (weighted / totalWeight) * 100 : 0,
      signals,
      missing,
    };
  });

  return ranked.sort(
    (a, b) => b.score - a.score || a.gene.orf.localeCompare(b.gene.orf, undefined, { numeric: true }),
  );
}

/** Weights round-trip through the URL, so a ranking can be shared. */
export function encodeWeights(weights: Weights): string {
  return SIGNALS.map((id) => (weights[id] ?? 0).toFixed(2).replace(/\.?0+$/, '') || '0').join(',');
}

export function decodeWeights(value: string | undefined): Weights {
  if (!value) return { ...DEFAULT_WEIGHTS };
  const parts = value.split(',');
  const out = { ...DEFAULT_WEIGHTS };
  SIGNALS.forEach((id, index) => {
    const parsed = Number.parseFloat(parts[index] ?? '');
    if (Number.isFinite(parsed)) out[id] = Math.min(3, Math.max(0, parsed));
  });
  return out;
}
