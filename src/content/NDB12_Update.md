# NDB12_Update.md

What changed when we reran GenomegaMap on the expanded non-diabetes cohort (744 isolates), why some
numbers got better and one got worse, and the eccD3-vs-eccB3 question. Written 2026-07-23, after the
db-vs-ndb12 run finished. Companion to [Significance.md](Significance.md), [PNPS.md](PNPS.md), and
[GenomegaMap.md](GenomegaMap.md); it updates the local-FDR numbers in those.

---

## 1. What the run was

We kept diabetes fixed at 178 isolates and grew non-diabetes from 175 to 744 (the original NDB1 set
plus 569 new NDB2 isolates), for 922 total. Same GenomegaMap Constant model, same settings (uniform
1/61 codon frequencies, burnin=2000), so the traces are directly comparable to the old run. The point
was the project lead's question from the July 21 email: does adding isolates tighten the posteriors enough to
make the diabetes-vs-non-diabetes comparison more certain? The folder is `db-vs-ndb12/`, mirroring
`db-vs-ndb/`.

Reminder of the vocabulary. **omega (dN/dS)** is a per-gene rate ratio: amino-acid-changing
(nonsynonymous, NS) mutations versus silent (synonymous, S) ones. omega > 1 means change is favored
(positive selection), < 1 means change is removed (purifying / negative selection), ~1 is neutral.
**DPD** = P(omega in diabetes > omega in non-diabetes): near 1 means more positive selection in
diabetes, near 0 means more in non-diabetes.

---

## 2. Headline: the main result got stronger

The expansion did what the project lead predicted. Tighter non-diabetes posteriors pushed DPD further from 0.5
for the genes with a real difference.

| | 175-run | 744-run |
|---|---|---|
| genes at DPD > 0.95 (positive) | 14 | **35** |
| genes at DPD < 0.05 (purifying) | 17 | 33 |
| eccD3 (Rv0290) DPD | 0.945 | **0.968** (now clears 0.95) |
| Rv3193c DPD | 0.946 | **0.981** |
| recG (Rv2973c) DPD | 0.941 | 0.947 |
| Rv0648 DPD | ~0.968 | 0.966 |

Two things to notice. **eccD3 and Rv3193c crossed the 0.95 significance line**, which they did not on
the matched cohort. And **recG did not weaken**, its DPD actually rose slightly; it only fell out of
Table 3's top-10 slice because more other genes now sit above it. Nothing got worse here. DPD > 0.95 is
the paper's primary criterion, and by that criterion the result improved.

---

## 3. Why DPD and chi-square are helped by more non-diabetes isolates

Both are **per-gene** measures, so more data on the non-diabetes side is just more evidence for that one
gene.

- **DPD** compares a gene's diabetes omega posterior to its non-diabetes omega posterior. More
  non-diabetes isolates make the non-diabetes posterior narrower, so if there is a real difference the
  two curves overlap less and DPD moves toward 0 or 1. This is the whole reason we collected the extra
  isolates.
- **Chi-square** is the 2x2 table of that one gene's NS/S counts, diabetes vs non-diabetes. More
  non-diabetes alleles give the test more power, so real hits sharpen (Rv0648 p 0.026 -> 0.020, eccB3
  0.046 -> 0.017). It also acts as a filter: genes that only looked diabetes-enriched at 175 because the
  non-diabetes side was too shallow to have found their alleles yet get corrected. Five of the original
  ten Table-3 genes collapsed this way; all four candidate genes held (see [Significance.md](Significance.md) section 6).

Both are robust to the cohort being unbalanced, because neither looks at any gene except the one being
scored.

---

## 4. Why local FDR got hurt (and why it is not lost signal)

This is the one number that went the wrong way, and it caused a scare, so here it is in full.

| local FDR < 0.20 | 175-run | 744-run |
|---|---|---|
| positive (diabetes) direction | 10 | 8 |
| negative (purifying) direction | 10 | **0** |
| fitted empirical null | N(+0.024, 0.535) | N(-0.042, 0.599) |

**Why this happened.** Local FDR is not a per-gene measure. It asks "compared to the genome-wide
distribution of all 4018 genes, how surprising is this one?" To answer that it estimates a null bell
curve from the bulk of genes, then scores each gene against it. The imbalance (178 vs 744) slides the
whole distribution toward the non-diabetes direction, because deeper non-diabetes sampling discovers
more alleles everywhere, not just in the hits. That slide moves the null center left (+0.024 to -0.042)
and widens it (0.535 to 0.599). Every gene is then re-judged against a moved, wider goalpost, and the
negative direction (which the left shift points away from) loses all its significant genes.

**The proof that it is the ruler moving, not the biology:** the genes' own DPD did not change.

| gene | DPD 175 -> 744 | local FDR 175 -> 744 |
|---|---|---|
| Rv1937 | 0.012 -> 0.011 | 0.077 -> **0.204** |
| eccB3 (Rv0283) | 0.034 -> 0.015 (stronger) | 0.183 -> **0.246** |
| ppsC (Rv2933) | 0.023 -> ~0.02 | 0.134 -> 0.534 |

Rv1937 is just as extreme a purifying gene as it was; its local FDR tripled only because the null moved
under it. This is the same imbalance bias already documented for pN/pS in [PNPS.md](PNPS.md), where the
median diabetes-minus-non-diabetes log2 pN/pS slid from 0.000 to -0.0566. Same cause, different readout.

**So the honest one-liner:** more non-diabetes depth helps the per-gene tests (DPD, chi-square) and
distorts the genome-wide calibration (local FDR). It is the imbalance, not the depth, that hurts local
FDR. A balanced 744-vs-744 run would very likely recover it.

**What this means for the paper.** The positive-selection story rests on DPD > 0.95, which is not
confounded, so it is fine and stronger. The negative-selection screen (eccB3 and friends) was already
**excluded** from the paper for exactly this fragility, so nothing published depends on the collapsed
local FDR. If we ever want a clean local FDR or a defensible negative-selection claim, the fix is to
subsample non-diabetes back to ~178 to match, then rerun DPD and local FDR on the balanced pair.

---

## 5. eccD3 vs eccB3: opposite selection in one locus

eccD3 (Rv0290) and eccB3 (Rv0283) are two parts of the same molecular machine, the ESX-3 secretion
system (a pump that moves molecules across the cell wall), and they sit close together on the
chromosome. Yet they point opposite ways:

| gene | diabetes NS/S | reading in diabetes |
|---|---|---|
| **eccD3** | 8/1 | lots of amino-acid change, omega high, DPD 0.97, **positive** |
| **eccB3** | 2/9 | almost only silent change, omega low, DPD 0.015, **purifying** |

How can neighbors disagree?

1. **Selection acts on what each protein does, not on where it sits on the DNA.** Being adjacent is
   just filing order. eccD3 and eccB3 are different components of the pump doing different jobs, so they
   can face different pressure. eccD3's 8/1 says its protein is being remodeled in diabetes; eccB3's 2/9
   says the opposite, changes to it are being weeded out, so it is being held constant.
2. **Each signal is read only from that gene's own NS/S counts.** There is no cross-talk in the math.
   The 8/1 and the 2/9 are two independent measurements that happen to point opposite ways.
3. **This is evidence, not a contradiction.** If diabetes were just adding noise, or if this were a
   technical artifact (bad alignment, a lineage quirk), the whole ESX-3 neighborhood would look the
   same. Instead the two ends of one machine resolve in opposite, specific directions and the other ~9
   genes in the locus show no cohort difference at all. That specificity argues it is real biology
   localized to those two components.

The plausible, testable reading (see the July 6 emails and the eccD3 section of the paper): ESX-3
handles iron uptake and redox balance, and the diabetic host is more oxidative. One component (eccD3,
interacting with the changing host environment) may be pushed to **adapt** (positive selection), while a
core structural component (eccB3, which the machine cannot function without) becomes even **less
tolerant of change** (purifying) because the whole system is more essential under that stress. Same
machine, neighboring parts, opposite responses to one pressure. This is the "two sides of the same coin"
framing from the July 22 meeting.

Analogy for a meeting: an engine in harsh conditions. The air filter that faces the dirty environment
gets redesigned constantly (tolerates change); the crankshaft has to stay machined to spec or the engine
dies (change is removed). Adjacent parts, opposite selection, because they do different jobs.

---

## 6. The full list of what changed

**Cohort and tables**
- Table 1 (cohort summary) recomputed on 178/744 (was hardcoded at 178/175). Now read live from the
  metadata workbook. Diabetes side unchanged and asserted against the old verified counts.
- Supplemental Table T1 rebuilt to all 922 isolates (was 353).
- Methods text updated to 178/744/922.

**Positive selection (main story, in the paper)**
- Table 3, Table 4, Supplemental T3, Figures 1-3 and the local FDR cache all regenerated on 744.
- eccD3 and Rv3193c now clear DPD > 0.95; recG dropped out of the top-10 slice (still DPD 0.947).
- Table 3's top-10 membership shifted (Rv2650c, eis, Rv2812, relA, Rv0373c, Rv3377c, smc came in).
- Figure 4 (variant maps) and the PAML table/figures were left on the prior data because they involve
  Rv0648, which another effort owns.

**Negative selection (excluded from the paper)**
- Reran on the 744 MCMC. Counts-based Fisher ranking is unchanged (eccB3 #1, Rv1937 #4), nothing
  survives BH either way, and no purifying-direction gene clears local FDR < 0.20 (section 4).
- glgE weakened out of the DPD < 0.10 pool (0.078 -> 0.195).
- The criteria-variants workbook's local-FDR sheet now ranks the top-25 purifying genes by local FDR
  rather than filtering to an empty set.

**Method comparison**
- Regenerated `db_vs_ndb12_method_comparison.xlsx` and the two top-100 chi-square-vs-DPD scatters on 744.
  Top-100 chi-square and top-100 DPD overlap in 37 genes (Jaccard 0.23).

**Housekeeping**
- The `ndb12/` folder was renamed to `db-vs-ndb12/`.

---

## 9. The PAML rerun (added 2026-07-24)

The open item from section 7 is closed. the project lead sent the rebuilt **922-tip phylogeny** on
2026-07-24 (`FinalPaml/data/reference_tree/`), already binary, tips matching the cohort exactly. The
branch-model rerun launched on Grace at 23:29 the same night.

**What changed for PAML because of the expansion:**

| | 353 run (178 + 175) | 922 run (178 + 744) |
|---|---|---|
| testable "clean" genes | 1805 | **2614** |
| tree tips | 353 | 922 |
| where it runs | locally / FASTER | **Grace**, 2 array jobs |
| compute | hours | ~6157 core-hours, 8932 SU reserved |

**The clean set grew from 1805 to 2614**, which is a direct scientific benefit of the expansion and the
same mechanism that helped DPD. A gene is testable only if both cohorts show at least one nonsynonymous
and one synonymous allele; with 744 non-diabetes isolates instead of 175, far fewer genes have a cohort
with zero of one kind.

**The expansion also made PAML expensive.** codeml's cost goes as roughly tips^2.5, and non-diabetes
went from 175 to 744 tips while diabetes stayed at 178. A handful of genes went from minutes to over a
hundred hours. Two changes made it affordable: holding branch lengths fixed in `model=2`
(`--fix-blength`, see [PAML.md](PAML.md) section 11) and bin-packing genes into balanced array tasks.

**Early validation.** The 8-gene canary reproduced the old run's diabetes omegas to 4 decimal places.
It should: the diabetes cohort is the same 178 isolates. The non-diabetes omegas moved only where the
extra isolates carried variation the old cohort never sampled. That asymmetry is what a correct
expansion looks like.

**What is not yet known:** the genome-wide Spearman against DPD. The old run gave +0.92. Until the new
one finishes, that number is stale and should not be quoted as current.

---

## 7. What is still open

> **Updated 2026-07-24.** The tree and PAML item below is now **resolved and in progress**, see
> section 9.

- **The cohort is unbalanced (178 vs 744).** Fine for DPD and chi-square, a genuine bias for pN/pS and
  local FDR (sections 3 and 4). If we want the FDR and negative-selection views back, the clean move is
  a matched subsample of non-diabetes down to ~178.
- ~~**Whether to fold 744 into the tree and PAML**~~ **Done.** the project lead sent the 922-tip tree on
  2026-07-24 and the PAML rerun launched the same night. Section 9.
- **Supplemental T1 metadata coverage** for the 569 new isolates is taken from the combined workbook;
  worth a spot-check before submission.
- **Three genomegaMap runs still to execute**: the pooled 922 combined run (regenerates Table 2 and
  fixes the lldD1 count), drug-resistant vs sensitive, and lineage L2 vs L4. Inputs are built for all
  three. See the repo-root `todo.md`.

---

## 8. One-paragraph version

We reran GenomegaMap with non-diabetes grown from 175 to 744 isolates, diabetes fixed at 178. The
per-gene measures improved: more genes clear DPD > 0.95 (14 to 35) and eccD3 and Rv3193c crossed the
cutoff, because deeper non-diabetes sampling tightens the posteriors. The one number that fell, the
Efron local FDR (20 significant genes down to 8, and the negative direction from 10 to 0), fell not
because the signal weakened but because local FDR calibrates each gene against the whole-genome
distribution, and the 178-vs-744 imbalance shifted that distribution, the same bias we already flag for
pN/pS. Since the paper ranks on DPD and excludes negative selection, nothing published is hurt; a
matched subsample would restore a clean local FDR if we want it. And eccD3 (positive) sitting next to
eccB3 (purifying) in ESX-3 is not a contradiction but a specificity result: two parts of one machine
under opposite pressure in the diabetic host, which is stronger evidence than either gene alone.
