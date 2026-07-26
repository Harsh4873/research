# Significance.md

How the paper decides a gene is a hit, and how to defend that when challenged. This is the biggest
attack surface in the whole project, so it is worth having straight.

> **Update (2026-07-23):** after the expanded 744-isolate non-diabetes run, the local-FDR counts in
> sections 3 and 6 changed (positive direction 10 -> 8, negative direction 10 -> 0), and the imbalance
> caveat in section 7 now applies to local FDR as well as pN/pS. See [NDB12_Update.md](NDB12_Update.md)
> for the current numbers and why. DPD > 0.95 stays the primary criterion and is unaffected.
>
> **Update (2026-07-24):** the **+0.92 PAML correlation in section 5 is from the superseded
> 353-isolate run.** The PAML rerun on the 922-isolate tree launched on Grace tonight and will replace
> it. Do not quote +0.92 as a current number until it lands. Everything else in this doc is unchanged,
> because DPD and the local-FDR check do not depend on PAML.

---

## 1. The criterion

**DPD > 0.95** is the significance cutoff, marked with an asterisk in Table 3. Genes just below,
including **eccD3**, are reported as "near-significant leads" rather than being hidden or promoted.

DPD is a **posterior probability**, not a p-value. That distinction drives everything below.

---

## 2. Why there is no Benjamini-Hochberg on the main result

The obvious reviewer question is "you tested 4,018 genes, where is the correction?" The paper's
position, in order:

1. **DPD is not a p-value.** BH controls the false discovery rate among p-values under a null. A
   posterior probability already incorporates uncertainty rather than measuring deviation from a null,
   so BH is not the natural instrument.
2. **Bayesian multiplicity is normally handled by hierarchical shrinkage**, where sharing information
   across genes automatically shrinks extreme estimates. The GenomegaMap Constant model is **not
   hierarchical**, so that mechanism is not available here either. The paper says this explicitly.
3. **So an FDR-style check is applied to the DPD scores directly** (next section) instead of pretending
   they are p-values.

---

## 3. The local FDR check (this is the answer to the multiplicity question)

An **Efron empirical-null local false discovery rate** (the `locfdr` method) applied to the DPD scores.

Procedure as implemented:

1. Transform DPD to z-scores with the probit map `z = qnorm(DPD)`, so DPD 0.5 maps to z = 0.
2. Fit `locfdr` with an empirical null.
3. Read off local FDR per gene (the "local FDR" column in Table 3).

**Result: ten genes reach local FDR < 0.20 in the diabetes direction, essentially the same set as the
DPD > 0.95 genes.** That agreement is the point. Two different ways of asking "which genes stand out
from the bulk" pick the same genes, so the 0.95 cutoff is not arbitrary.

The empirical null matters: it estimates the null distribution from the data itself rather than
assuming a theoretical N(0,1), which absorbs genome-wide inflation from population structure and
shared ancestry.

---

## 4. The chi-square is support only

Table 4 reports a raw Pearson 2x2 chi-square p-value on the NS/S counts. The paper states plainly:

- it is **support, not the significance criterion**
- BH was applied across all 4,018 genes as an internal check
- **no gene survives BH**

Do not soften this. Reporting it openly is stronger than burying it, and it is consistent: the paper
never claims chi-square significance for any gene.

---

## 5. The real defence: independent methods agreeing

Statistical thresholds are arguable. Convergence across unrelated methods is much harder to dismiss.
The paper has three independent lines:

| method | family | what it contributes |
|---|---|---|
| **[GenomegaMap DPD](GenomegaMap.md)** | Bayesian, phylogenetic | the primary ranking |
| **[PAML branch model](PAML.md)** | frequentist likelihood-ratio, phylogenetic | independent confirmation, **Spearman +0.92** with DPD (353-isolate run; 922 rerun in flight) |
| **[pN/pS + chi-square](PNPS.md)** | direct counting, no tree | independent corroboration of the counts |

The PAML agreement is the single strongest number in the paper's defence: an entirely different
statistical framework, different software, different assumptions, and it reproduces the DPD ordering.

Because it carries that much weight, it is worth knowing exactly how independent it is. PAML **fixes**
its nuisance parameters (kappa at 4, uniform codon frequencies) so the likelihood ratio is clean, while
GenomegaMap **estimates** kappa and integrates over them. That looks like an inconsistency and is worth
stating in Methods as a deliberate difference. It also strengthens the argument: the two methods do not
share assumptions, so their agreement is not one assumption counted twice.

---

## 6. The newest and most persuasive argument: the expanded cohort as a filter

Growing non-diabetes from 175 to 744 isolates, holding diabetes at 178, split the Table 3 genes in two:

- **Five held** (Rv2812, Rv0648, Rv3193c, eccD3, recG), and two improved their chi-square p-value.
- **Five collapsed** (Rv0888, Rv2953, Rv1992c, Rv1217c, Rv2414c), because their non-diabetes
  nonsynonymous alleles simply had not been discovered yet at 175 isolates. Rv0888 reversed sign.

**All four candidate genes survived.** This is a falsification test the candidates could have failed and
did not, which is much better evidence than any threshold argument. If a reviewer says "your hits are
small-sample noise," this is the direct rebuttal, and it is worth its own paragraph in Results.

---

## 7. Known weak points, stated honestly

- **eccD3 sits below the 0.95 cutoff.** The paper builds its story around it via biology and
  convergent evidence, not statistical significance. Keep that framing; overclaiming here is the
  easiest way to lose a reviewer.
- **No gene survives BH on chi-square.** Already disclosed.
- **Cohorts are unbalanced (178 vs 744)** after the expansion. Fine for DPD, a genuine bias for pN/pS
  (see [PNPS.md](PNPS.md)). Say so rather than letting a reviewer find it.
- **Confounding by lineage, country, and drug resistance.** Table 1 exists to show cohort composition;
  Table 5 shows the same method applied to drug resistance instead of diabetes and recovers known
  resistance genes, which demonstrates the method surfaces true signal when a real split exists.

---

## 8. One-paragraph version, for when someone asks in a meeting

We rank genes by DPD, the posterior probability that diabetes omega exceeds non-diabetes omega, with a
0.95 cutoff. Because DPD is a posterior rather than a p-value, and the model is not hierarchical, we
check multiplicity with an Efron empirical-null local FDR on the DPD scores, which flags essentially the
same ten genes. Chi-square and pN/pS are reported as independent support only, and we state that none
survive BH. The strongest evidence is convergence: an independent PAML branch-model test correlates with
DPD at +0.92, and expanding the non-diabetes cohort to 744 isolates eliminated half the original hits
while all four candidate genes held.
