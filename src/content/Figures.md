# Figures.md

Every figure built for the paper, what it argues, and how to read it. Six planned figures, 29
candidate images. The paper takes one per slot; the rest exist so the choice is visible and so each
argument has a picture if it needs one.

Rebuild any folder with one command:

```bash
cd UPLOAD/figures/1 && python3 fig1.py
```

Each `fig<N>.py` is self-contained and readable: the plotting code is inlined, not imported. Flags:
`--list`, `--current`, `--preferred`, `--supporting`, `--only NAME`.

The plan is the project lead's whiteboard, transcribed at
`miscellaneous/notes/2026-07-26-results-whiteboard.md`.

---

## His three standing rules

These came out of the 2026-07-24 meeting and are easy to undo by accident.

1. **No correlation number on the S-curve plot.** His words, garbled by the transcriber as *"and you
   can remove that spear memorial"*, meaning Spearman. His reasoning: the scatter already shows the
   correlation, so the number on it is redundant. Reporting it in text is fine.
2. **Unrestricted axes** on that plot. *"I don't actually see anything wrong with that first plot, the
   one where you didn't restrict the axis."*
3. **Signed 2dLL, not signed Z.** Z is a linear transform of the same thing and gives an identical
   plot, and 2dLL is what other PAML papers report.

Colour is validated, not eyeballed. The categorical set `#2E6FA7` diabetes, `#D97B29` non-diabetes,
`#C43D4B` hits, `#6A4C93` passes all six colour-vision checks (worst adjacent pair dE 12.9 deutan,
15.5 normal vision). Grey `#8A9099` is only ever a neutral, never a series, and never alone.

---

## Figure 0: cohort composition (2 images)

**Answers:** who is in each cohort, so a reader can judge whether the two groups are comparable.

| image | |
|---|---|
| `Fig0_cohort_barcharts.png` | current: lineage and drug resistance |
| `Fig0_alt_cohort_barcharts.png` | **preferred**: adds the missing **country** panel |

**The change that matters:** bars are **percent within cohort**, not raw counts, with the raw n
printed above each bar. Diabetes has 178 isolates and non-diabetes 744, so raw bars would make
non-diabetes look dominant in every category regardless of composition.

Marked "?" on the whiteboard: build it and see if it helps.

---

## Figure 1: the main scatter (6 images)

**Answers:** which genes have a higher dN/dS in diabetes than in non-diabetes. **Starred** on the
whiteboard as one of the two key figures.

| image | |
|---|---|
| `Fig1_omega_scatter.png` | current: top 10 filled red |
| `Fig1_alt_omega_scatter.png` | **preferred**: **circles every significant gene**, recG drawn grey |
| `FigC1_criteria_funnel.png` | supporting: how 4,018 genes become 33 |
| `FigC2_dpd_vs_omega_criteria.png` | supporting: the criteria drawn as shaded regions |
| `FigD1_volcano.png` | supporting: effect size against certainty |
| `FigD2_dpd_distribution.png` | supporting: DPD histogram, both tails |

**Why circles instead of red fill:** his ask, *"instead of doing top 10, can you just circle all the
significant ones?"* Top-10 is a presentation choice; DPD > 0.95 is the actual criterion, and the
figure should show the criterion.

**recG is grey** because it is no longer significant on the expanded cohort. Leaving it red would be
quoting a stale result in a picture.

**FigC1 says something uncomfortable and true:** after DPD > 0.95 (35 genes), the omega > 1 filter
removes 1 and the count filter removes 1 more, leaving 33. DPD is doing essentially all the
selecting. That is consistent with the paper calling DPD the criterion and the rest support, but if a
reviewer asks what the other criteria do, this is the honest answer.

**FigD1 (volcano)** plots log2(omega_DB / omega_NDB) against DPD. It shows why the raw ratio is not
the ranking: genes with a huge ratio but mid DPD have wide posteriors, usually few alleles. DPD
already folds uncertainty in.

---

## Figure 2: secondary support for DPD (5 images)

**Answers:** do independent methods agree with the DPD ranking. Three panels.

| image | |
|---|---|
| `Fig2_dpd_vs_chi.png` | current: panel (a) alone |
| `Fig2_alt_dpd_support_3panel.png` | **preferred**: the full 3-panel |
| `FigE1_rank_concordance.png` | supporting: how much the rankings actually agree |
| `FigF1_counts_vs_dpd.png` | supporting: why the count filter exists |
| `FigF2_posterior_width.png` | supporting: more evidence gives tighter posteriors |

**Panel (b) is the S-curve**, PAML signed 2dLL against DPD, and it is the single most important
validation in the paper: an entirely different statistical framework reproducing the same ordering.
**Spearman +0.924 on 2,376 genes**, where the superseded 353-isolate run gave +0.922. The number is
**not printed on the panel**, per his instruction; only `n = 2,376` is, so a partial run can never be
mistaken for a complete one.

**Panel (c) is circular by construction and you should know it.** It takes the top 100 genes by DPD
as the answer key and asks how well pN/pS and chi-square recover them. It can only measure agreement
*with* DPD; it can never show DPD is right. Panel (b) does that job, because PAML never sees a DPD
value.

Panel (c) also reports two summary numbers that disagree: **AP 0.63 vs ROC-AUC 0.98** for pN/pS. Both
are correct. ROC-AUC flatters a method when the negative class is 39 times the positive one, because
correctly dumping the irrelevant bulk at the bottom is easy. **Quote AP, or quote both and say why.**

**FigF2 answers his 2026-07-21 email directly.** He subsampled one gene (espF) and found more
isolates gave tighter posteriors. This checks it on all 4,018: both cohorts sit on the *same*
width-versus-evidence curve, and what the larger cohort buys is more alleles per gene, **median 4 to
9**, which moves genes rightward along that curve. It tightens by moving genes, not by changing the
relationship.

**Panel order is unresolved.** The whiteboard has (a) PAML, (b) chi-square, (c) AUC. The built figure
has chi-square first. The transcript says the order is flexible, but the whiteboard is the later
artifact.

---

## Figure 3: posterior distributions (3 images)

**Answers:** how confident is the omega estimate for each candidate gene.

| image | |
|---|---|
| `Fig3_omega_posteriors.png` | current |
| `Fig3_alt_omega_posteriors.png` | **preferred**: two rows, positive candidates on top, **negative-selection genes below** |
| `FigH1_candidate_forest.png` | alternative: omega with 95% credible intervals instead of densities |

**Why this figure exists at all:** it is the visual argument for using a posterior rather than a point
estimate. A gene with 3 mutations and one with 300 can both give omega 2.0; the width of the
distribution is what separates them, and DPD inherits that width.

**The second row was his idea:** *"I think that might be a stronger angle than the 4 genes."*

`FigH1` is the same information as a forest plot. Some readers find intervals easier than densities,
and it fits more genes per inch. Worth having both and picking.

---

## Figure 4: variants along the gene (5 images)

**Answers:** where in each gene the mutations sit, and whether the diabetes ones cluster anywhere
meaningful.

| image | |
|---|---|
| `Fig4_variant_maps.png` | current: four genes stacked in one figure |
| `Fig4_alt_variant_Rv0290_eccD3.png` | **preferred**: one gene per file |
| `Fig4_alt_variant_Rv0648_Rv0648.png` | |
| `Fig4_alt_variant_Rv3193c_Rv3193c.png` | |
| `Fig4_alt_variant_Rv2973c_recG.png` | |

**One gene per file** because he flagged that four stacked squishes them.

**The normalisation matters, and he raised it himself:** *"there's something like 4 times as many
non-diabetes as diabetes, right?"* Bar height is **percent of that cohort** carrying the variant, on a
square-root scale, not a raw count. Raw counts would make non-diabetes look mutation-rich in every
gene purely from having 4.2 times more isolates. The sqrt scale keeps singletons visible while
stopping common variants from dominating.

---

## Figure 5: the discussion figures (8 images)

**Answers:** the "more conserved" story, mostly negative selection and the ESX-3 pair. Marked "?" on
the whiteboard.

| image | |
|---|---|
| `Fig5_log2pnps_panels.png` | current: log2 pN/pS scatter, diabetes vs non-diabetes |
| `Fig5_alt_log2pnps_bars.png` | **preferred**: the vertical paired bars he sketched, 3 panels |
| `FigI1_discussion_gene_counts.png` | **the figure he drew on the board**, see below |
| `FigG1_negative_selection.png` | the 12 lowest-DPD genes, counts and log2 pN/pS |
| `FigB1_esx3_locus_dpd.png` | DPD across the ESX-3 locus |
| `FigB2_esx3_omega_ci.png` | the same genes with credible intervals |
| `FigA1_expansion_filter_slopes.png` | the falsification test, 175 vs 744 |
| `FigA2_expansion_genomewide.png` | the same shift across all 4,018 genes |

### FigI1, the one from the whiteboard sketch

He drew mshC as four bars: diabetes 3 nonsynonymous / 6 synonymous, non-diabetes 10 / 5. **The master
spreadsheet matches exactly**, which is a nice check on both the data and the reading of the sketch.

This figure exists because **mshC appeared in no other figure**. `FigG1` draws the 12 lowest-DPD
genes and mshC ranks 16th, so the gene he named in the meeting, and `todo.md` names for Table 7/8,
was invisible. eccB3 made the cut, mshC did not, and the discussion wants both.

It shows raw counts as he drew them, but **raw counts are not comparable across cohorts** (178 vs
744), so the pN/pS ratio is printed under each cohort. That contrast in one panel: eccD3 at 1.81
diabetes vs 0.44 non-diabetes, against eccB3 at 0.11 vs 0.61 and mshC at 0.19 vs 0.61.

### FigA1, the strongest argument in the paper

`teach/Significance.md` calls the cohort-expansion filter *"the strongest argument in the paper"* and
*"worth its own paragraph in Results"*, and it had no figure until now. Growing non-diabetes from 175
to 744 split the ten Table 3 genes cleanly: **five held, five collapsed, and all four candidate genes
held.** That is a falsification test the candidates could have failed and did not, which is much
better evidence than any threshold argument.

`FigA2` puts the same shift against all 4,018 genes, showing the collapse was specific to
under-sampled genes rather than something that happened everywhere.

### FigB1, and an honest correction

The eccD3-vs-eccB3 story is that two components of one secretion system point opposite ways. The
first version of this figure was titled *"and the rest of the locus does not move"*, which is
**false**: eccA3 (Rv0282) is also at DPD 0.970 and eccC3 at 0.90. Three of eleven ESX-3 components
differ. The title now says what the data shows. If you pitch the pair as *the* two genes in ESX-3
that differ, a reader will look and find a third.

---

## What is not final

- **Fig 2 panel (b)** changes as the last 238 PAML genes land. The 2,376 fitted so far are the
  *smaller* genes, since tasks ran cheapest-first.
- **Anything touching drug resistance or lineage** waits on the FASTER runs.
- **Nineteen figures exist and the paper takes six.** Choosing is still open.
- **Fig 0 and Fig 5** both carry a "?" on the whiteboard, pending his call.

---

## Where the code lives

| | |
|---|---|
| readable, self-contained, one per figure | `UPLOAD/figures/<N>/fig<N>.py` |
| canonical, what the paper build runs | `Paper/scripts/build_figures*.py` |
| re-sync the readable copies after editing the canonical ones | `python3 UPLOAD/scripts/regenerate_figure_scripts.py` |
| panel (c) alone, heavily commented | `UPLOAD/scripts/fig2c_precision_recall.py` |

The duplication is deliberate: the `UPLOAD` copies exist to be read. They are generated by parsing
the canonical modules and following the call graph, so they cannot drift through a typo, only through
someone editing one side and not re-running the regenerator.
