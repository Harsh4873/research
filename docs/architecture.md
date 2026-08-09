# Architecture

Research is a client-side React + Vite single-page app (Recall for notes, Review for papers, Genes for the H37Rv genome); the deployed site is static files on GitHub Pages served under `/research/`. There is no app server. Runtime network I/O is the optional Firebase sync (Google auth + Firestore), which stays completely unloaded until the user turns Sync on; the key-less public literature APIs; and the gene data published by the sibling site at `/genes/`.

## Pipeline

```
markdown text
  → lib/markdown.ts   parse to a block model (headings, paragraphs, lists, tables, quotes, code)
  → lib/extract.ts    derive explicit concepts, section recall cards, contextual clozes, outline, stats
  → lib/questions.ts  build multiple-choice quizzes and match rounds (seeded RNG, word-overlap distractors)
  → components/*      study modes render the derived material
```

Study material is always **derived** from the stored markdown at load time (memoized per set). Storage keeps only the source markdown plus progress, so extraction improvements apply retroactively to existing sets.

## Modules

- `src/lib/markdown.ts` — small deterministic Markdown parser producing typed blocks with inline runs (bold, italic, code, links). ATX headings only; front matter is skipped (a `title:` is honored).
- `src/lib/extract.ts` — deterministic semantic heuristics that turn blocks into cards: bold definition sentences, bold-term bullets (`**Term** — definition`), plain `Term: definition` bullets, two-plus-column tables, `Q:`/`A:` pairs, and section recall questions backed by the section's opening explanation. Cloze sentences blank bounded concepts rather than arbitrary emphasized words, with generic status words and oversized claims filtered out. Cards get stable content-hash ids so progress survives re-parsing.
- `src/lib/bundled.ts` and `src/content/` — nine privacy-scrubbed research documents installed as ordinary sets. Content hashing prevents duplicate imports, and deletion tombstones stop removed bundled sets from returning.
- `src/lib/speech.ts` — optional browser-native speech recognition for the Notes composer. Audio is not stored by Recall; support and speech processing depend on the browser.
- `src/lib/questions.ts` — quiz builder (term→definition, definition→term, and cloze multiple choice) with distractors preferred by word overlap, plus match-round sampling. Uses a seeded mulberry32 PRNG so tests are deterministic.
- `src/lib/answer.ts` — typed-answer checking: Unicode/diacritic normalization, punctuation and leading-article stripping, and length-scaled Levenshtein tolerance.
- `src/lib/store.ts` — versioned `localStorage` persistence (`recall.data.v1`) for sets, per-card progress boxes, match best times, and theme preference. Works against an injectable storage so tests run in Node without a DOM.
- `src/App.tsx` — hash router (`#/`, `#/set/<id>/<mode>`) so deep links work on GitHub Pages without a SPA fallback.
- `public/sw.js` — cache-first app-shell service worker; its activate step also deletes caches left behind by the previous app that lived at this scope.

## Review (papers → markdown)

Review reuses the whole study pipeline; it only adds a front end that produces markdown from a paper. A Review paper is an ordinary `StudySet` whose id carries a `paper-` prefix (`src/lib/paper-set.ts`), so it syncs, exports, and studies with no schema or rules change. Paper metadata rides in YAML front matter, which `parseMarkdown` now returns as `meta`.

```
PMID / PMCID / DOI ─→ lib/paper-id.ts     parse and normalise the identifier
                   ─→ lib/europepmc.ts    Europe PMC metadata, then full text from
                                          Europe PMC or NCBI PMC, whichever has a
                                          body; NCBI E-utilities as metadata fallback
                   ─→ lib/jats.ts         JATS XML → sectioned study markdown
PDF file           ─→ lib/pdf-import.ts   PDF.js text runs (lazy-loaded)
                   ─→ lib/pdf-layout.ts   lines, columns, headings, tables → markdown
                                        ↓
                              the same extract → questions pipeline
```

- Full text is requested from both archives. `fetchAnyFullTextXml` asks Europe PMC first and NCBI's `efetch db=pmc` second, keeping the copy `hasArticleBody` accepts: Europe PMC holds no `fullTextXML` for author manuscripts, and PMC keeps citation-only stubs for some articles, so neither source alone answers "is the full text available". The old `inEPMC !== 'N'` gate is gone — that flag marks exactly the author-manuscript case worth trying.
- `src/lib/xml.ts` — a small dependency-free well-formed-XML parser, so JATS parsing behaves identically in the browser and in Node tests without a DOM implementation.
- `src/lib/reference-file.ts` — reads a reference list out of a dropped file, including `.docx` (a minimal central-directory ZIP reader plus `DecompressionStream('deflate-raw')`, then the same XML parser over `word/document.xml`).
- Bulk import: `parsePaperIds` scans free text for every identifier, matching bare numbers only in the 7–8 digit PMID range so years, volumes, and page numbers are not mistaken for ids. Because a reference list cites one paper by PMID, DOI, *and* PMCID, results are collapsed by `paperIdentity` after resolution — the real list this was built against yields 98 identifiers and 37 distinct papers.
- `src/lib/jats.ts` — the converter. `tableGrid` lays each table on a grid first, expanding `colspan` and `rowspan` into every cell they cover, because Markdown has no spans and silently dropping one shifts later rows into the wrong columns; multi-row headers are then joined into the single header row Markdown allows. The PMC id is read from whichever `pub-id-type` the feed uses (`pmcid`, `pmc`, `pmcaid`), since every float link and image URL hangs off it. Floats render in place under level-4 headings so they stay navigable without becoming section questions; reference lists are collected once from anywhere in the article; equations published only as images are counted and explained rather than stamped as empty placeholders; licences are normalised to short labels (`CC BY-NC`).
- `src/lib/pdf-layout.ts` — pure layout reconstruction (spans → lines → cells → blocks) so every heuristic is unit-tested without a PDF engine. `pdf-import.ts` is the thin PDF.js bridge and uses the **legacy** build, because the modern one calls platform APIs (`Math.sumPrecise`, `Map.getOrInsertComputed`) that most shipping browsers lack.
- Markdown is shaped for the extractor: glossary bullets and two-column tables become term cards, prose sections become recall prompts, and citation/keyword lines are deliberately written without bold or `Term: value` shapes so they cannot turn into junk cards.
- `extract.ts` skips publishing apparatus (references, acknowledgements, funding, conflicts) entirely, and skips section-question generation for headings that make poor questions (glossary, contents, supplementary material) while still mining their contents.

`src/lib/paper-search.ts` searches the saved papers. Every query token must match somewhere (so extra words narrow the result), while *where* it matched sets the rank: an exact identifier outranks a title hit, which outranks author, journal, year, and finally body text — body matches carry a snippet. `findExistingPaper` resolves an identifier against the library so a lookup of something already saved opens it rather than refetching.

### Review reading views

`src/lib/paper-view.ts` derives everything the Review tabs show from the parsed document, so the heuristics are unit-tested without a browser:

- **Data** — tables, equations, and figures are recovered by pairing each level-4 float heading (`#### Table 1. …`) with the blocks that follow it. A figure's artwork arrives as a Markdown image, so it is stored with the document and renders retroactively for papers imported before this existed; `components/Inline.tsx` renders it and falls back to a link on a load error. A float the source could not express — a table published only as a picture — is kept as a note plus a PMC link rather than dropped. Supplementary entries are parsed back out of the markdown list and linked to their PMC download path (`/pmc/articles/{PMCID}/bin/{file}`); data-availability sections are matched by heading.
- **Claims** — sentences are scored against authorial-claim patterns (`we found`, `our results suggest`, `taken together`), boosted by the numbers they contain and penalised for hedging, then classified as finding / conclusion / quantified.
- **Find** — a linear scan over blocks returning match ranges for highlighting, plus a numbers mode built on a measurement-shaped regex (p-values, effect sizes, percentages, units, ratios) that deliberately skips bare small integers, plain years, and digits belonging to identifiers.
- **Skim** — per-section gist (first sentences), word count, and key numbers.

`SetShell` picks its tab set from the set id: `paper-` sets get Notes / Data / Claims / Find / Skim, everything else keeps the study modes. `components/Inline.tsx` turns DOIs, PMIDs, PMC ids, and bare URLs written as plain text into links, so existing sets gain clickable identifiers without being re-imported.

## Genes (gene → literature → ranking)

The Genes tab reads its data from the **sibling site**, not from this repository. MtbScope is deployed at `/genes/` on the same origin, so `src/lib/gene-catalog.ts` resolves `siblingUrl('genes.json')` by walking one segment up from `import.meta.env.BASE_URL` — `/research/` → `/genes/data/genes.json`. Nothing is duplicated, and the catalog stays whatever MtbScope last published.

```
/genes/data/genes.json  ─→ lib/gene-catalog.ts   validate and expand the compact records
/genes/data/selection.enc ─→ lib/lockbox.ts      AES-256-GCM + PBKDF2 → gunzip → JSON
                        ─→ lib/gene-search.ts    rank a query against symbol, locus, annotation
                        ─→ lib/gene-literature.ts Europe PMC counts and papers per gene
                        ─→ lib/gene-priority.ts  weighted multi-signal ranking
                        ─→ components/GenesView.tsx
```

- `src/lib/gene-catalog.ts` — validates the published payload rather than trusting it: a record with no locus tag is dropped, an unnamed gene is named by its locus, an unrecognised functional class becomes `unclassified`, and a payload with no usable genes throws `GeneDataError` instead of rendering an empty page. `parseSelection` does the same for the selection dataset, and reads a missing measurement as `null` rather than `0`.
- `src/lib/lockbox.ts` — the same envelope MtbScope uses (AES-256-GCM, PBKDF2-SHA256 at 600,000 iterations, gzip). The selection dataset is unpublished multi-author work, so it ships encrypted and is decrypted in the browser only after the passphrase is entered; the key is cached under `research.genes.key` so a reload does not ask again. Search, annotation, literature and pathway signals all work without it.
- `src/lib/gene-search.ts` — a scored lookup rather than a substring filter: exact locus (1000) > exact symbol (900) > symbol prefix > locus prefix > symbol substring > an annotation match requiring *every* term. That ordering is what makes `eccD3` return `Rv0290` itself instead of a gene whose annotation happens to mention it. `findGene` resolves a deep link only on a confident match (score ≥ 500), so `?gene=protein` opens nothing rather than something arbitrary.
- `src/lib/gene-literature.ts` — Europe PMC search scoped with `TITLE_ABS:` and paired with the organism. Scoping matters: unscoped, `relA` returns 10,390 hits, mostly reference lists; scoped, it returns 214 papers actually about the gene. When the scoped query returns nothing, `geneLiterature` widens to full text so a rarely-named locus still surfaces its papers (`Rv0205`: 0 → 3). Batch counts run through a concurrency limiter over the visible shortlist, not the whole genome.
- `src/lib/gene-priority.ts` — every signal is scaled to 0–1 and the score is the weighted mean **over the signals that have data for that gene**. Treating an unmeasured signal as zero would rank a well-studied gene below an unmeasured one for no reason, so missing signals are excluded from both numerator and denominator and reported per row. Weights round-trip through the URL (`?w=…`), so a ranking is linkable; an all-zero weighting scores everything 0 rather than dividing by zero.

Handing a paper to Review goes through `App.tsx`: `GenesView` raises the identifier, App stores it as `pendingPaper` and switches tabs, and `ReviewView` imports it once and clears the handoff. Genes owns no storage of its own — nothing it shows is persisted except the cached passphrase.

## Naming

The app is **Research**; Recall, Review and Genes are its three halves. Only the visible
naming changed: the persisted keys (`recall.data.v1`, `recall.sync.on`) and the
Firestore collection (`recall_users`) keep their original names, because
renaming them would orphan saved data and break the deployed security rules.

## Sync

Sync is optional and lazy: `src/lib/cloud.ts` (and the Firebase SDK with it) is `import()`ed only when the user enables Sync or has it enabled from a previous session (`recall.sync.on` flag).

- `src/firebase.ts` — shared-project Firebase init (named app, persistent Firestore cache, Google provider). The web config is public by design; access control lives in the rules.
- `src/lib/sync-core.ts` — pure, unit-tested merge logic. Sets replicate to `recall_users/{uid}/sets/{setId}` and progress to `recall_users/{uid}/progress/{setId}`. Deletions write tombstones (`deleted`, `deletedAt`) so they propagate; live docs win by `updatedAt` (last writer wins), per-card progress wins by `last` touch, and match best-times keep the minimum. `planPush` diffs local state against the last-known remote index so only strictly-newer docs are written.
- `src/lib/cloud.ts` — Firestore adapter: snapshot listeners fold remote changes into app state, local changes push through a debounced diff, and auth uses popup sign-in with a redirect fallback for installed PWAs.
- Account gate: sets live under `recall_users/{uid}`, so each verified Google account has a separate library. `checkSyncAccount` (pure, in `sync-core.ts`) verifies the email claims before any listener opens. Firestore then enforces that the authenticated UID matches the path on every read and write.
- `firestore.rules` — the complete ruleset for every app in the shared Firebase project; Recall's block validates document shapes, requires a verified Google session, keeps `createdAt` immutable, and requires monotonic `updatedAt`. Covered by `tests/firestore.rules.test.ts` against the emulator (`npm run test:rules`).

## Testing

Vitest (Node environment) covers the parser, extraction heuristics, question building, answer checking, storage round-trips, and the Genes libraries (catalog validation, search ranking, literature query shape, and the scoring rules — including that a missing signal is excluded rather than counted as zero). `npm run build` type-checks then produces `dist/`, which the Pages workflow verifies before deploying.

Genes is also smoke-tested in a real browser against a combined static site — `dist/` mounted at `/research/` beside MtbScope's `dist/` at `/genes/` — because the sibling data path only resolves correctly when both sites sit on one origin.
