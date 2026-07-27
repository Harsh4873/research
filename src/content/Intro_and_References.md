# Introduction and references

The project lead's TBDM survey (2026-07-26) and every reference behind it: what each paper is, what claim
it carries, and where the gaps are. Written so you can talk about the Introduction in a meeting
without having read all 30 papers.

Compiled from the introduction draft, reference notes, and accompanying correspondence dated 2026-07-26.

> **If you read one paper, read Restrepo (2016).** That is the project lead's recommendation, and it is the review that
> anchors the immunology paragraph. It has been read in full and written up in **[§4](#4-restrepo-2016-read-in-full)**,
> including the two things it does *not* cover: **no oxidative stress, and nothing about the bacterium
> itself.** That second gap is our paper's opening. Everything else can be skimmed from §3.

---

## 1. What this text is, and what it replaces

It replaces the opening of the Introduction, everything **up to** the sentence:

> "To gain insight into the interaction between TB and diabetes, we can take advantage of the large
> amount of genomic data..."

So it is the front half of the Intro: the clinical and epidemiological case that TB plus diabetes
(TBDM) is a real and distinct problem. Our own contribution, the genomic scan, starts right after it.
Nothing in this text is about our data, and no number in it needs regenerating when a run finishes.

Seven paragraphs, ~1015 words, 30 references. The draft is described as still needing fine-tuning.

---

## 2. The argument, paragraph by paragraph

The structure is a funnel: from "this association exists" down to "here is the specific mechanism our
paper measures."

| ¶ | Claim | Load-bearing references |
|---|---|---|
| 1 | TB is the most prevalent disease worldwide; diabetes ~400M and often undiagnosed | `[REF?]` — **gap** |
| 2 | DM raises TB risk 2-3x, so 12-15% of TB patients have diabetes | Jeon & Murray 2008, Franco 2024, Ponce de Leon 2004, Baker 2012, Ugarte-Gil 2020, Xu 2019 |
| 3 | Whether DM raises **drug-resistant** TB is unresolved | 4 for, 3 against (see §3) |
| 4 | TBDM means worse disease and worse outcomes | Baker 2011, Alisjahbana 2007, Faurholt-Jepsen 2013, Jimenez-Corona 2013, Kumar 2019, Magee 2015, Mave 2022 |
| 5 | DM raises relapse risk | Baker 2011, Ponce de Leon 2004, Lee 2014, Jimenez-Corona 2013, Mave 2022 |
| 6 | Mechanism, immune side: hyperinflammation that does not kill better | Restrepo 2016, Kumar 2013, Restrepo 2014, Vallerskog 2010 |
| 7 | **Mechanism, metabolic side: oxidative stress** | Voskuil 2011, Liu 2014, Navasardyan 2023, Singhal 2014, **Mave 2022** |

### Why paragraph 7 matters more than the rest

This is the hinge into our paper. The chain it builds:

1. Hyperglycemia raises reactive oxygen species (ROS).
2. Mtb has dedicated transcriptional defences against ROS (Voskuil 2011), so oxidative stress is a
   real selective pressure on the bacterium, not just host pathology.
3. Metformin, which lowers ROS, reduces bacterial burden and improves outcomes (Singhal 2014). That
   is the interventional evidence the pressure is causal.
4. **Mave (2022) measured a higher in-host mutation rate in TBDM patients from Mtb whole genomes.**

Step 4 is the published precedent for reading diabetes-driven selective pressure directly off
bacterial genomes, which is exactly what our DPD scan does. It is also the literature support for the
**eccD3 / ESX-3 oxidative-stress hypothesis** the paper leads with. If a reviewer asks why an
oxidative-stress story is plausible a priori, paragraph 7 is the answer.

---

## 3. The references, grouped by the job they do

Thirty formal references. Grouped by role rather than by year, because that is how you will need them.

### Meta-analyses and large cohorts, the risk numbers (¶2)

| Reference | What it is | The number it carries |
|---|---|---|
| **Jeon & Murray 2008**, PLoS Med | Systematic review, 13 observational studies, >17k cases | RR **3.11** |
| **Franco 2024**, Cochrane | Systematic review, 48 studies | RR **1.61** |
| **Ponce de Leon 2004**, Diabetes Care | Cohort, southern Mexico | **6.8x** TB incidence; also ~6x reactivation in ¶5 |
| **Baker 2012**, Clin Infect Dis | Prospective cohort, Taiwan | Risk scales with number of DM complications |
| **Ugarte-Gil 2020**, Clin Infect Dis | **TANDEM**, 4 TB-endemic countries | 12-15% TBDM. **This is our own cohort's source paper** |
| **Xu 2019**, PLoS Med | WGS + phylogenetics, Valencia, Spain | Supports the 12-15% figure |

Two things to notice. First, Jeon 3.11 and Franco 1.61 differ by roughly 2x; that is not an error, it
is the difference between an older 13-study set and a newer 48-study Cochrane review, and the text
presents both rather than picking. Second, **Ugarte-Gil 2020 is TANDEM**, the study our Peru and
Indonesia isolates come from, so it appears in both the Intro and the Methods.

### The drug-resistance disagreement (¶3)

Deliberately left unresolved. Worth knowing which side each paper is on:

| Elevated DR risk in TBDM | No consistent association |
|---|---|
| Bashar 2001 (Bellevue, NYC) | Baker 2011 (systematic review) |
| Fisher-Hoch 2008 (Texas/Mexico border) | Hsu 2013 (eastern Taiwan) |
| Magee 2015 (Georgia, the country) | Magee 2013 (Peru) |
| Liu 2017 (meta-analysis, MDR) | |

Note **Magee appears on both sides** (2013 Peru, 2015 Georgia). That is not sloppiness, it is the
same author finding different answers in different regions, which is the point the paragraph makes.
This paragraph matters to us because we have a **drug-resistant vs sensitive** genomegaMap split
running; if it produces something, this is the paragraph it speaks to.

### Outcomes and relapse (¶4-5)

| Reference | Design | Finding |
|---|---|---|
| **Baker 2011**, BMC Medicine | Systematic review | Treatment failure/death **1.69x**, death **4.95x**, relapse **3.89x**. The most-cited source in the whole Intro |
| **Alisjahbana 2007**, Clin Infect Dis | Indonesia | 78% vs 93% smear-negative at end of treatment |
| **Viswanathan 2014** | South India | Same effect replicated |
| **Jimenez-Corona 2013**, Thorax | Mexico | Delayed sputum conversion; more cavitary disease; relapse aHR **1.89** |
| **Faurholt-Jepsen 2013** | Tanzania | **5x** death during treatment |
| **Lee 2014**, PLoS One | Taiwan, nested case-control | Relapse aOR **1.96** |
| **Kumar 2019**, eLife | India | Persistent inflammation during treatment, more tissue damage |
| **Magee 2015** | Georgia | Cavities, smear grade, MDR |
| **Mave 2022**, Clin Infect Dis | **WGS**, India | Index cases more likely diabetic; 83% of recurrence is relapse not reinfection, using an **8-SNP** genome-wide threshold |

**Mave 2022 is the most important paper in the list for us.** It is the only one that does what we do:
sequence Mtb genomes and read a diabetes effect off the bacterial genome. It appears in ¶4 (transmission),
¶5 (relapse vs reinfection) and ¶7 (mutation rate). The 8-SNP threshold is a useful precedent if anyone
asks how genomic distance gets turned into a clinical claim.

### Immunology (¶6)

| Reference | Contribution |
|---|---|
| **Restrepo 2016**, Microbiol Spectr | The review. Start here. Frames the innate-immune-perturbation hypothesis |
| **Kumar 2013**, J Infect Dis | Expanded Th1/Th17, raised IFN-γ and IL-17 in peripheral blood |
| **Restrepo 2014**, PLoS One | Monocytes from chronically hyperglycemic patients show **reduced** phagocytosis |
| **Vallerskog 2010**, J Immunol | Diabetic mice show **delayed** adaptive immunity |

The paragraph's argument is a paradox worth being able to state: TBDM patients are **more**
inflamed but **not** better at killing Mtb. Restrepo 2014 and Vallerskog 2010 supply the resolution,
uptake and antigen presentation are impaired, so the response is loud but late. The paragraph also
notes results differ between blood and lung lesions, which is the standard caveat on all of this.

### Oxidative stress (¶7)

| Reference | Contribution |
|---|---|
| **Voskuil 2011**, Front Microbiol | Mtb's transcriptional response to reactive oxygen and nitrogen species |
| **Liu 2014**, Inflammation | ROS via NADPH oxidase (NOX2) inside macrophages |
| **Navasardyan 2023**, Biomedicines | Oxidative stress in diabetics, TB meningitis context |
| **Singhal 2014**, Sci Transl Med | **Metformin** as adjunct TB therapy: lower burden, less tissue damage, less cavitation and mortality in TBDM patients |
| **Mave 2022** | Higher in-host mutation rate in TBDM, i.e. oxidative DNA damage measured genomically |

---

---

## 4. Restrepo (2016), read in full

*Diabetes and Tuberculosis*, Microbiol Spectr 4(6). **PMID 28084206, PMC5240796, open access at
<https://pmc.ncbi.nlm.nih.gov/articles/PMC5240796/>.** This is the one the project lead recommends if
you read nothing else, and the recommendation is sound: it is a review, so it carries the whole
clinical story in one place, and it is the source most of paragraph 6 rests on.

### What is in it

Five parts: epidemiology, how TB presents differently in diabetics, treatment outcomes, the
immunological basis, and latent TB.

**The risk numbers.** Threefold increased TB risk, RR **3.11 (95% CI 2.27-4.26)**. Regional TBDM
prevalence runs far higher than the global figure: **South India 54%, Pacific Islands 40%,
northeastern Mexico 36%**. Population attributable risk is **at least 20%** in endemic countries, and
on the Texas-Mexico border diabetes accounts for **28% of adult TB cases and 51% among ages 35-60**.

**The mechanism, host side.** Monocytes from diabetics bind and phagocytose Mtb significantly less
well, and the defect is in both the monocyte itself and in serum opsonins, particularly **complement
C3**. Diabetic mice show reduced uptake by alveolar macrophages within two weeks. Meanwhile the
adaptive response is *hyper*-active, higher Th1 and Th17, more IFN-γ and IL-17, and the review states
plainly that this hyper-reactive response **is not effective for killing Mtb**. Only *poorly
controlled* diabetes raises TB risk, which is what pins the mechanism on chronic hyperglycemia rather
than on diabetes as a label.

**Outcomes.** Death RR **1.89** unadjusted, **4.95** adjusted for age and confounders. Relapse RR
**3.89 (2.43-6.23)**. Drug resistance: explicitly unclear, a meta-analysis of recurrent cases gave
OR **1.24 (0.72-2.16)**, not significant, on only four studies.

### Cross-check against the project lead's draft: it holds up

Every number the draft attributes to Baker (2011) matches what Restrepo independently reports:

| claim in the draft | Restrepo (2016) | verdict |
|---|---|---|
| Jeon & Murray RR 3.11 | RR 3.11 (2.27-4.26) | matches |
| death 4.95x adjusted | 4.95 (2.69-9.10) | matches |
| relapse 3.89x | 3.89 (2.43-6.23) | matches |
| drug resistance unresolved | OR 1.24 (0.72-2.16), n.s. | matches |

### Two things it does NOT do, and both matter to us

**1. It never mentions oxidative stress or reactive oxygen species.** Not once. The review's mechanism
chapter is entirely about phagocytosis, complement and cytokines. So paragraph 7, the paragraph that
sets up our paper, gets **no support from Restrepo at all**; it rests entirely on Voskuil 2011,
Liu 2014, Singhal 2014, Navasardyan 2023 and Mave 2022. That is worth knowing before a meeting: if
someone reaches for "the standard review" to check the oxidative-stress claim, they will not find it
there. It is a newer thread than this 2016 review.

**2. It never asks whether the bacterium itself is different.** The entire review is host-side:
immune dysfunction, tissue perfusion, treatment response. It does not discuss whether Mtb evolves
differently, mutates faster, or comes under different selection inside a diabetic host.

**That second gap is our paper's opening.** The authoritative review of TB and diabetes, as of 2016,
treats the bacterium as a constant and the host as the variable. Mave (2022) was the first crack in
that (higher in-host mutation rate from WGS), and a gene-level selection scan is the natural next
step. If you need a one-sentence justification for why this study is worth doing, it is: *the standard
review of TBDM has nothing to say about the pathogen, and we can now measure that directly.*

### Numbers worth borrowing for the draft

Paragraph 1 currently carries a `[REF?]` on diabetes prevalence and has no impact figure. Restrepo
supplies several that would land harder, all citable through this review:

- Diabetes accounts for **28% of adult TB cases** on the Texas-Mexico border, **51%** at ages 35-60.
- Population attributable risk **at least 20%** in endemic countries.
- A modelling study projected that halting the rise in diabetes would avoid **6 million TB cases and
  1.1 million TB deaths** over 20 years across 13 high-burden countries.

Also worth noting: the draft says 12-15% of TB patients have diabetes, from TANDEM. Restrepo's
regional figures (36-54%) are much higher. Not a contradiction, TANDEM is a four-country average and
those are the worst-hit regions, but if a reviewer knows the Indian literature the 12-15% may read as
low. A clause acknowledging the regional range would pre-empt it.

## 5. Gaps and things to fix

Three were already flagged in the text:

1. **`[REF?]`** on the ~400M diabetes prevalence in ¶1. Needs an IDF Diabetes Atlas or WHO citation.
2. **`(add 45-India?)`** in the drug-resistance paragraph, a reference numbered elsewhere but not
   yet pulled in.
3. **`(add?: Degner 2017)`**, Clin Infect Dis, metformin reversing the increased TBDM mortality. It
   would strengthen ¶7's interventional evidence, and ¶7 is the paragraph that sets up our result.

Two we found:

4. **Dooley & Chaisson (2009)**, "Tuberculosis and diabetes mellitus: convergence of two epidemics",
   is in the reference list but **never cited in the text**. It is a standard framing review and
   would sit naturally in ¶1. Either cite it or drop it; an uncited entry will be flagged in
   production.
5. **Name spellings are inconsistent between the two documents.** The list has `Ponce-De-Leon`,
   `BakerMA` (no space) and `Jiménez-Corona` (accented) where the text has "Ponce de Leon", "Baker"
   and "Jimenez-Corona". Harmless while drafting, but this is exactly what breaks automated citation
   matching when the list goes into a reference manager.

One conflict was noted but the text does not yet reflect:

6. **Huang (2026) disputes Mave (2022)** on whether diabetes cases are more likely to be index cases.
   It is in the "could be added" list with that annotation. ¶4 currently states the Mave transmission
   finding without the caveat. Worth a clause, especially since Mave is load-bearing for us elsewhere.

---

## 6. How to handle the references

They are currently in chronological order, while the stated convention is order of first mention.
That distinction matters more than it sounds:

- Most TB and infectious-disease journals (Clin Infect Dis, Lancet ID, PLoS Med) use **Vancouver**:
  numbered in the text, reference list in **citation order**, journal names abbreviated ISO 4.
- Chronological is fine for drafting. It must be renumbered before submission, and **renumbering by
  hand is how citation errors get introduced**, because every insertion shifts everything after it.
- The fix is a reference manager, not discipline. **Zotero** is the sensible default here: free,
  open-source, exports BibTeX and RIS, has a Word plugin, and no lock-in. Import the 30 by DOI, pick
  the target journal's style, and ordering and formatting become automatic.
- All but a handful of these entries already carry DOIs or PMIDs, so the import is mostly mechanical.
  Use `https://doi.org/...` form, not the retired `dx.doi.org`.

**Recommendation:** do not renumber anything by hand. Agree the target journal first, since the
journal picks the style, then import once into Zotero and let it produce both orderings.

---

## 7. The one-paragraph version, for the meeting

The project lead has written the front half of the Introduction: seven paragraphs, 30 references,
taking the reader from "diabetes raises TB risk 2-3x" through worse outcomes and higher relapse, into two
mechanisms. The second mechanism, oxidative stress from hyperglycemia, is the one that sets up our
paper, and it ends on Mave (2022), which found a higher in-host mutation rate in TBDM patients from
whole-genome sequencing. That is the published precedent for reading a diabetes effect off Mtb
genomes, which is what our scan does. The text is solid; what it needs is three flagged citation gaps
filled, one uncited reference (Dooley 2009) either used or dropped, and the list moved into a
reference manager before it gets renumbered into citation order.
