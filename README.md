# Research

Research is the owner's personal reading and study tool, published at `https://harsh.bet/research/` from the standalone `Harsh4873/research` repository. It has two halves:

- **Recall** — paste or upload Markdown notes and turn them into study material: flashcards, quizzes, fill-in-the-blanks, and a matching game.
- **Review** — give it a PMID, PMCID, DOI, or a PDF and read the paper fast: notes, data, claims, find, and skim.

Both share the same clean reading view with read-aloud, and turning on Sync keeps everything on every signed-in device (phone and laptop).

## Review: read papers fast

- Accepts a bare PMID, a PMCID, a DOI, or a pasted PubMed / PMC / Europe PMC / doi.org URL.
- **Search your library**: the saved papers list filters as you type — by title, author, journal, year, PMID, PMCID, DOI, or any word in the paper's text (body matches show a snippet). Looking up an identifier you already saved offers to open it instead of fetching it again.
- **Bulk import**: paste a whole reference list, or drop a `.docx` / `.txt` / `.csv` / `.ris` of one. Every PMID, PMCID, and DOI in it is fetched, and the copies of a paper cited three different ways collapse into one set.
- Fetches open-access full text from Europe PMC as JATS XML and converts it to Markdown: sectioned headings, structured abstract, GFM tables with captions and footnotes, equations (LaTeX and MathML), figure captions, supplementary material, glossary, and references.
- Falls back to the PubMed abstract (via Europe PMC, then NCBI E-utilities) when a paper is not open access, and says so plainly.
- **PDF upload** for anything paywalled: the file is parsed on the device with PDF.js — column-aware line reconstruction, heading detection, running-head removal, table and equation heuristics, and caption capture. Nothing is uploaded.
- Mines an abbreviations glossary from the prose, so `Operational taxonomic unit (OTU)` is defined for you.
- Review is for **reading**, not drilling. A paper opens with its own tabs:
  - **Notes** — the whole paper as clean markdown, with every DOI, PMID, and PMC id clickable.
  - **Data** — every supplementary file (linked straight to its download), table, figure caption, equation, and data-availability statement in one place.
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
- Optional cross-device sync: sets and progress replicate through the shared private Firebase account, with tombstoned deletes and last-writer-wins merging.

## Privacy boundary

By default generation and storage run in the browser: notes, generated cards, and progress live in `localStorage` on the device. If the owner starts dictation, speech recognition is provided by the browser and may use its configured speech service; Recall does not store audio. Turning on **Sync** signs in with the owner's Google account and replicates sets and progress to the shared private Firebase project (`recall_users/{uid}/…` in Firestore); the security rules only admit the configured verified Google account. There are no other accounts or analytics.

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
2. When `firestore.rules` changes, deploy it once to the shared Firebase project (`firebase deploy --only firestore:rules`). The rules file is the complete ruleset for every app in the project, so keep it identical across the Daymark, Slate, Fare, Notes, and Research repositories.
