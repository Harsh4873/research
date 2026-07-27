# Recall

Recall is the owner's personal study tool, published at `https://harsh.bet/research/` from the standalone `Harsh4873/research` repository. Paste or upload Markdown notes and Recall turns them into study material — flashcards, quizzes, fill-in-the-blanks, matching games, and a clean reading view. Turning on Sync keeps the same sets and progress on every signed-in device (phone and laptop).

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
