import { useRef, useState, type DragEvent } from 'react';
import { ClipboardPaste, Download, FilePlus2, Sparkles, Trash2, Upload } from 'lucide-react';
import type { AppData, StudyMaterial, StudySet } from '../model';
import { masteryPercent } from '../lib/store';

export interface ImportItem {
  title?: string;
  markdown?: string;
  json?: string;
  error?: string;
}

interface LibraryProps {
  data: AppData;
  materialFor: (set: StudySet) => StudyMaterial;
  onImport: (items: ImportItem[]) => void;
  onLoadSample: () => void;
  onDelete: (set: StudySet) => void;
  onExport: (set: StudySet) => void;
  onOpen: (set: StudySet) => void;
}

export function Library({ data, materialFor, onImport, onLoadSample, onDelete, onExport, onOpen }: LibraryProps) {
  const [pasteOpen, setPasteOpen] = useState(data.sets.length === 0);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteBody, setPasteBody] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const submitPaste = () => {
    if (!pasteBody.trim()) return;
    onImport([{ title: pasteTitle.trim() || undefined, markdown: pasteBody }]);
    setPasteTitle('');
    setPasteBody('');
  };

  const handleFiles = async (files: FileList | File[]) => {
    const items: ImportItem[] = [];
    for (const file of Array.from(files)) {
      const name = file.name.replace(/\.(md|markdown|txt|json)$/i, '');
      try {
        const text = await file.text();
        if (/\.json$/i.test(file.name)) items.push({ title: name, json: text });
        else items.push({ title: name, markdown: text });
      } catch {
        items.push({ error: `Could not read ${file.name}` });
      }
    }
    if (items.length > 0) onImport(items);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) void handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="library fade-in">
      {data.sets.length === 0 && (
        <section className="hero">
          <h1 className="hero-title">Paste your notes. Get a study kit.</h1>
          <p className="hero-sub">
            Recall turns plain markdown notes into flashcards, quizzes, fill-in-the-blanks, a matching game, and a
            clean reading view — all in your browser, nothing uploaded.
          </p>
        </section>
      )}

      <section
        className={`import-panel ${dragOver ? 'import-dragover' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        aria-label="Import notes"
      >
        <div className="import-actions">
          <button type="button" className="btn btn-primary" onClick={() => setPasteOpen((v) => !v)}>
            <ClipboardPaste size={16} aria-hidden /> Paste markdown
          </button>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            <Upload size={16} aria-hidden /> Upload files
          </button>
          <button type="button" className="btn btn-ghost" onClick={onLoadSample}>
            <Sparkles size={16} aria-hidden /> Try the sample
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".md,.markdown,.txt,.json,text/markdown,text/plain,application/json"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        <p className="drop-hint">…or drop <code>.md</code> files anywhere in this box. Several at once is fine — each becomes its own set.</p>

        {pasteOpen && (
          <div className="paste-form fade-in">
            <input
              className="input"
              placeholder="Set title (optional — taken from the first heading if empty)"
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
            />
            <textarea
              className="textarea"
              rows={10}
              placeholder={'# Topic\n\n- **Term**: definition\n- Another term: what it means\n\nProse with **key phrases** in bold becomes fill-in-the-blank cards.'}
              value={pasteBody}
              onChange={(e) => setPasteBody(e.target.value)}
            />
            <div className="paste-form-actions">
              <button type="button" className="btn btn-primary" disabled={!pasteBody.trim()} onClick={submitPaste}>
                <FilePlus2 size={16} aria-hidden /> Create study set
              </button>
            </div>
          </div>
        )}
      </section>

      {data.sets.length > 0 && (
        <section className="sets-section" aria-label="Your study sets">
          <h2 className="section-title">Your sets</h2>
          <div className="sets-grid">
            {data.sets.map((set) => {
              const material = materialFor(set);
              const progress = data.progress[set.id] ?? { cards: {} };
              const ids = [...material.terms.map((t) => t.id), ...material.clozes.map((c) => c.id)];
              const mastery = masteryPercent(progress, ids);
              return (
                <div key={set.id} className="set-card">
                  <button type="button" className="set-card-main" onClick={() => onOpen(set)}>
                    <div className="set-card-title">{set.title}</div>
                    <div className="set-card-meta">
                      <span className="meta-chip">{material.stats.terms} terms</span>
                      <span className="meta-chip">{material.stats.clozes} blanks</span>
                      <span className="meta-chip">{material.stats.readingMinutes} min</span>
                    </div>
                    <div className="mastery-row">
                      <div className="mastery-bar">
                        <div className="mastery-fill" style={{ width: `${mastery}%` }} />
                      </div>
                      <span className="mastery-num">{mastery}%</span>
                    </div>
                  </button>
                  <div className="set-card-actions">
                    <button type="button" className="icon-btn" onClick={() => onExport(set)} aria-label={`Export ${set.title}`} title="Export as JSON">
                      <Download size={16} aria-hidden />
                    </button>
                    <button type="button" className="icon-btn icon-btn-danger" onClick={() => onDelete(set)} aria-label={`Delete ${set.title}`} title="Delete set">
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
