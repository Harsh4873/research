# Research

Research is the owner's personal reading and study tool, published at `https://harsh.bet/research/` from the standalone `Harsh4873/research` repository. It has two halves:

- **Recall** — paste or upload Markdown notes and turn them into study material: flashcards, quizzes, fill-in-the-blanks, and a matching game.
- **Review** — give it a PMID, PMCID, DOI, or a PDF and read the paper fast: notes, data, claims, find, and skim.

Both share the same clean reading view with read-aloud, and turning on Sync keeps everything on every signed-in device (phone and laptop).

## Review: read papers fast

- Accepts a bare PMID, a PMCID, a DOI, or a pasted PubMed / PMC / Europe PMC / doi.org URL.
- **Search your library**: the saved papers list filters as you type — by title, author, journal, year, PMID, PMCID, DOI, or any word in the paper's text (body matches show a snippet). Looking up an identifier you already saved offers to open it instead of fetching it again.
- **The manuscript bibliography** is one click: Review offers every reference cited by the diabetes selection manuscript and its supplementary material as a collection, fetches only the ones not already saved, and the offer disappears once they all are.
- **Bulk import**: paste a whole reference list, or drop a `.docx` / `.txt` / `.csv` / `.ris` of one. Every PMID, PMCID, and DOI in it is fetched, and the copies of a paper cited three different ways collapse into one set.
- Fetches open-access full text from Europe PMC as JATS XML and converts it to Markdown: sectioned headings, structured abstract, tables with captions and footnotes, equations (LaTeX and MathML), figures with their published artwork, supplementary material, glossary, and references.
- **Tables keep their shape.** A table is laid out on a grid before it becomes Markdown, so a cell that spans rows or columns is written at every position it covers and a two-row header is flattened into one (`Time point — 0 month`). Dropping a `rowspan` shifts every later row a column to the left, which quietly files values under the wrong heading; that no longer happens.
- **Figures show the figure.** The artwork published with the article is carried through and rendered; if the image will not load, or the article never published one, the figure degrades to a link to it rather than a broken box. Tables the source only published as a picture say so and link out.
- Falls back to the PubMed abstract (via Europe PMC, then NCBI E-utilities) when a paper is not open access, and says so plainly.
- **PDF upload** for anything paywalled: the file is parsed on the device with PDF.js — column-aware line reconstruction, heading detection, running-head removal, table and equation heuristics, and caption capture. Nothing is uploaded.
- Mines an abbreviations glossary from the prose, so `Operational taxonomic unit (OTU)` is defined for you.
- Review is for **reading**, not drilling. A paper opens with its own tabs:
  - **Notes** — the whole paper as clean markdown, with every DOI, PMID, and PMC id clickable.
  - **Data** — every supplementary file (linked straight to its download), table, figure (artwork and caption, or a link when it cannot be shown), equation, and data-availability statement in one place.
  - **Claims** — the sentences where the authors say what they found, filtered by findings / conclusions / quantified results.
  - **Find** — instant search across the paper, plus a Numbers mode listing every effect size, p-value, percentage, and count with its sentence.
  - **Skim** — the headline claims, then a section-by-section gist with each section's key numbers.
- Papers still sync and export like any other set; Recall keeps the flashcards, quiz, blanks, and match.

All lookups use free, key-less public APIs (Europe PMC and NCBI E-utilities) straight from the browser; there is no backend.

## What it does

- Imports `.md` / `.txt` notes by paste, file picker, or drag-and-drop; each document becomes a study set.
- Includes ten removable research-note sets on first load while keeping the uploader available for newer files.
- Extracts term–definition pairs from definition sentences, bold-term bullets, `Term: definition` lines, tables, and `Q:`/`A:` pairs, then adds answerable section-level recall prompts for prose-heavy notes.
- Generates fill-in-the-blank sentences from meaningful concepts and known terms while rejecting generic status words, verbs, and oversized emphasized claims.
- Adds typed or browser-native speech-to-text notes directly from the Notes view; saved notes immediately refresh the generated study material.
- Study modes: **Notes** (rendered outline + glossary), **Flashcards** (flip, star, self-grade), **Quiz** (multiple choice with distractors), **Blanks** (typed answers with fuzzy matching and hints), and **Match** (timed pairing game).
- Tracks per-card mastery (learning → almost → mastered) and per-set progress, with a "focus weak cards" filter in every mode.
- Exports and re-imports sets as JSON.
- Optional cross-device sync: sets and progress replicate through a private UID-scoped Firebase workspace, with tombstoned deletes and last-writer-wins merging.

## Privacy boundary

By default generation and storage run in the browser: notes, generated cards, and progress live in `localStorage` on the device. If a user starts dictation, speech recognition is provided by the browser and may use its configured speech service; Recall does not store audio. Turning on **Sync** signs in with a verified Google account and replicates sets and progress to that account's private path (`recall_users/{uid}/…` in Firestore). There are no analytics.

Every Google account gets its own `recall_users/{uid}` silo. The same account sees the same library across browsers and devices; a different account starts with a separate library and cannot access another UID's data.

## Local development

```bash
npm install
npm test
npm run typecheck
npm run test:rules   # Firestore rules against the emulator (needs Java + firebase-tools)
npm run build
npm run dev
```

## Deployment

1. Push to `main`; GitHub Actions tests, builds, and publishes `/research/` to GitHub Pages directly from this repository. There is no app backend to deploy.
2. When `firestore.rules` changes, deploy it once to the shared Firebase project:

   ```bash
   npx --yes firebase-tools login   # once per machine
   npm run deploy:rules             # firebase deploy --only firestore:rules --project pickledgerpro
   ```

   The rules file is the complete ruleset for every app in the project, so keep it byte-identical across Gym, Daymark, Slate, Fare, Notes, and Research — deploying from any of them replaces the project rules. If Sync reports a permission error, confirm this complete file is the deployed policy.
