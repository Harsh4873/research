# PNPS.md

The secondary, count-based check. Feeds Table 4. It is deliberately **not** the significance criterion,
and knowing why is most of what you need to defend it.

> **Note, 2026-07-24.** The NS/S counts computed here do double duty: they are also what decides which
> genes PAML can test at all. A gene needs at least one nonsynonymous and one synonymous allele in
> **both** cohorts, otherwise codeml pins omega at a boundary and the estimate is meaningless. That
> gives the 2614-gene clean set, derived straight from these counts with no codeml at all. See
> [PAML.md](PAML.md) section 12.

---

## 1. What it is

pN/pS is the crude, non-phylogenetic version of dN/dS. No tree, no likelihood, no MCMC. Just count
mutations against the H37Rv reference and divide.

- **pN** = observed nonsynonymous changes / possible nonsynonymous sites
- **pS** = observed synonymous changes / possible synonymous sites
- **pN/pS** = the ratio. Below 1 = purifying selection, above 1 = relaxed or positive.

Its whole value is independence: it shares no machinery with [GenomegaMap](GenomegaMap.md), so agreement
between them is real corroboration rather than the same assumption twice.

---

## 2. Exactly how it is calculated

Per gene, walk every codon position `i`:

1. Take the **H37Rv reference codon** at that position. Skip positions where the reference is not a
   clean codon.
2. **Possible sites.** Generate the nine codons one nucleotide away. Count how many change the amino
   acid (adds to possible NS) and how many do not (adds to possible S). This is the denominator, and it
   depends only on the reference, so it is identical across cohorts.
3. **Observed changes.** Collect the set of **distinct codons** seen across isolates at that position.
   For each distinct codon that is not the reference:
   - one nucleotide away, same amino acid, then observed S += 1
   - one nucleotide away, different amino acid, then observed NS += 1
   - more than one nucleotide away, then there is no single mutational path, so count it as **NS** and
     also add one to possible NS. These are tallied separately in the "multi-nucleotide alleles counted
     as NS" column.
4. Totals over the gene, with a **+1 pseudocount** on both numerator and denominator:

```
pN = (observed NS + 1) / (possible NS + 1)
pS = (observed S  + 1) / (possible S  + 1)
pN/pS = pN / pS
```

The pseudocount exists so a gene with zero synonymous changes still yields a finite ratio instead of
dividing by zero.

**The cohort comparison** reported in Table 4 is the log2 difference:

```
diff = log2( pN/pS [diabetes] / pN/pS [non-diabetes] )
```

Positive means the diabetes cohort looks more relaxed or positively selected.

**Chi-square** is a raw Pearson 2x2 on the four counts (DB NS, DB S, NDB NS, NDB S), **no Yates
correction**, df = 1. Support only, explicitly not the significance criterion.

---

## 3. The one design choice that matters most: alleles, not occurrences

Counting is of **distinct alleles**, not per-isolate occurrences. If 400 isolates share the same
mutation it counts once, not 400 times.

That is the right call (it stops a single clonal expansion from dominating a gene), but it creates the
method's central weakness: **allele discovery scales with how many isolates you sequenced.** Sequence
more isolates and you find more distinct alleles, mechanically.

---

## 4. Why unequal cohort sizes are a real problem here

Measured directly when the non-diabetes cohort went from 175 to 744 isolates (4.25x):

| | 175 isolates | 744 isolates | factor |
|---|---|---|---|
| observed NS alleles | 11,234 | 28,794 | 2.56x |
| observed S alleles | 6,750 | 16,917 | 2.51x |
| median pN/pS | 0.506 | 0.555 | |

The reassuring part: NS and S inflate almost identically (2.56 vs 2.51), so the **ratio** largely
survives. The concerning part: not exactly. The median diabetes-minus-non-diabetes log2 difference
shifted from exactly **+0.0000** (when cohorts were matched at 178 vs 175) to **-0.0566**, purely from
sampling depth.

**So: unequal sizes are fine for GenomegaMap and a genuine bias for pN/pS.** That distinction is worth
stating plainly in Methods, because it looks like an inconsistency otherwise.

---

## 5. The most useful result this produced

Recomputing Table 4 on the 744-isolate set, holding the diabetes side fixed at 178, split the ten
Table 3 genes cleanly in two.

**Held up** (non-diabetes counts grew in both NS and S, ratio survived): Rv2812 (p 0.066 to 0.048),
Rv0648 (0.026 to 0.020), Rv3193c, **Rv0290/eccD3 (diff 2.17 to 2.03)**, Rv2973c/recG.

**Collapsed** (non-diabetes NS alleles were simply undiscovered at 175): Rv0888 (1/4 to 10/4, diff 2.13
to **-0.33**), Rv2953 (**0/2** to 7/4), Rv1992c, Rv1217c, Rv2414c.

The collapsed genes were never really diabetes-enriched. The old cohort was too shallow to find
nonsynonymous alleles that were present all along. **All four candidate genes are in the group that
held.** This is the strongest argument in the paper that the candidates are not small-sample artefacts.

---

## 6. What a reviewer will attack, and the answer

**"pN/pS ignores phylogeny, so shared ancestry inflates your counts."**
True, and it is exactly why this is secondary. Counting distinct alleles rather than occurrences blunts
it, and GenomegaMap and PAML both handle the tree properly. The paper never rests a claim on pN/pS
alone.

**"None of your chi-square p-values survive Benjamini-Hochberg."**
Stated openly in the paper. The chi-square is support, not the criterion; the significance criterion is
DPD with a local-FDR check. See [Significance.md](Significance.md).

**"Your two cohorts have very different sizes."**
Acknowledged and quantified above. If pressed, the clean answer is to subsample non-diabetes to 178
repeatedly and average, which restores comparability with the original balanced analysis.

**"Why a pseudocount?"**
To keep genes with zero synonymous changes finite. Note it also inflates ratios for very low-count
genes, which is precisely the failure mode that made Rv2953 (0 non-diabetes NS alleles) look like a hit
until the cohort deepened.

---

## 7. Where the code is

`db-vs-ndb12/scripts/pnps/calculate_pnps.py` (per-gene table) and
`db-vs-ndb12/scripts/pnps/compare_table4_ndb12.py` (the old vs new comparison).
Validated by reproducing the existing db-vs-ndb workbook exactly, 16/16 spot checks, including the
Rv0290 counts of 8/1 and 5/5 that the project lead quoted by email.

The counts also land in `db-vs-ndb12/master/db_vs_ndb_master.xlsx` under the `pN/pS` section, which is
where `FinalPaml/lib/genes.py` reads them from to build the PAML clean set.

**For Table 4** (from the 2026-07-24 meeting): add a **rank-by-delta-log2-pN/pS** column alongside the
DPD rank, then sort by DPD. The point being made is that ranking by pN/pS delta is *not* the best way to
find the diabetes association, and showing both ranks side by side makes that visible.
