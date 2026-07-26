import { useEffect, useMemo, useRef, useState } from 'react';
import { GraduationCap, Monitor, Moon, Sun } from 'lucide-react';
import type { AppData, Mode, StudyMaterial, StudySet, SyncStatus, Theme } from './model';
import { MODES } from './model';
import type { CloudEngine } from './lib/cloud';
import { extractStudyMaterial } from './lib/extract';
import { parseMarkdown } from './lib/markdown';
import {
  createSet,
  deleteSet,
  exportSetJson,
  getProgress,
  loadData,
  parseSetExport,
  recordAnswer,
  saveData,
  toggleStar,
  upsertSet,
  withProgress,
} from './lib/store';
import { SAMPLE_MARKDOWN, SAMPLE_TITLE } from './lib/sample';
import { withBundledSets } from './lib/bundled';
import { Library, type ImportItem } from './components/Library';
import { SetShell } from './components/SetShell';
import { SyncMenu } from './components/SyncMenu';

const SYNC_FLAG_KEY = 'recall.sync.on';

function syncFlag(): boolean {
  try {
    return localStorage.getItem(SYNC_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function setSyncFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(SYNC_FLAG_KEY, '1');
    else localStorage.removeItem(SYNC_FLAG_KEY);
  } catch {
    /* storage blocked */
  }
}

type Route = { view: 'library' } | { view: 'set'; setId: string; mode: Mode };

function parseHash(): Route {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'set' && parts[1]) {
    const mode = (MODES as readonly string[]).includes(parts[2]) ? (parts[2] as Mode) : 'notes';
    return { view: 'set', setId: parts[1], mode };
  }
  return { view: 'library' };
}

function navigate(hash: string) {
  window.location.hash = hash;
}

export default function App() {
  const [data, setData] = useState<AppData>(() => withBundledSets(loadData()));
  const [route, setRoute] = useState<Route>(parseHash);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'off' });
  const cloudRef = useRef<CloudEngine | null>(null);

  const bootCloud = async (): Promise<CloudEngine> => {
    const { startCloud } = await import('./lib/cloud');
    const engine = startCloud({
      onStatus: setSyncStatus,
      onRemote: (fold) => setData((d) => fold(d)),
    });
    cloudRef.current = engine;
    return engine;
  };

  useEffect(() => {
    if (syncFlag()) void bootCloud();
  }, []);

  const enableSync = async () => {
    setSyncFlag(true);
    const engine = await bootCloud();
    await engine.signIn();
  };

  const disableSync = async () => {
    setSyncFlag(false);
    setSyncStatus({ state: 'off' });
    await cloudRef.current?.signOut();
  };

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    saveData(data);
    cloudRef.current?.push(data);
  }, [data]);

  useEffect(() => {
    const root = document.documentElement;
    if (data.theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = data.theme;
  }, [data.theme]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  const materialCache = useRef(new Map<string, StudyMaterial>());
  const materialFor = (set: StudySet): StudyMaterial => {
    const key = `${set.id}:${set.updatedAt}`;
    let material = materialCache.current.get(key);
    if (!material) {
      material = extractStudyMaterial(set.markdown);
      materialCache.current.set(key, material);
      if (materialCache.current.size > 50) {
        const first = materialCache.current.keys().next().value;
        if (first) materialCache.current.delete(first);
      }
    }
    return material;
  };

  const importItems = (items: ImportItem[]) => {
    const created: StudySet[] = [];
    const errors: string[] = [];
    let next = data;
    for (const item of items) {
      if (item.error) {
        errors.push(item.error);
        continue;
      }
      try {
        let markdown = item.markdown ?? '';
        let title = item.title;
        if (item.json !== undefined) {
          const parsed = parseSetExport(item.json);
          markdown = parsed.markdown;
          title = parsed.title;
        }
        if (!markdown.trim()) {
          errors.push('Nothing to import — the file was empty.');
          continue;
        }
        const docTitle = parseMarkdown(markdown).title;
        const set = createSet(title || docTitle || 'Untitled set', markdown, Date.now() + created.length);
        next = upsertSet(next, set);
        created.push(set);
      } catch {
        errors.push(item.title ? `“${item.title}” is not a valid Recall export.` : 'That JSON is not a valid Recall export.');
      }
    }
    setData(next);
    if (errors.length > 0) setNotice(errors[0]);
    else if (created.length > 1) setNotice(`Imported ${created.length} sets.`);
    if (created.length === 1) navigate(`/set/${created[0].id}/notes`);
  };

  const loadSample = () => {
    const existing = data.sets.find((s) => s.title === SAMPLE_TITLE);
    if (existing) {
      navigate(`/set/${existing.id}/notes`);
      return;
    }
    importItems([{ title: SAMPLE_TITLE, markdown: SAMPLE_MARKDOWN }]);
  };

  const removeSet = (set: StudySet) => {
    if (!window.confirm(`Remove “${set.title}” and its progress? This also removes it from synced devices.`)) return;
    setData((d) => deleteSet(d, set.id, Date.now()));
    if (route.view === 'set' && route.setId === set.id) navigate('/');
  };

  const exportSet = (set: StudySet) => {
    const blob = new Blob([exportSetJson(set)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${set.title.replace(/[^\w\d-]+/g, '-').replace(/^-+|-+$/g, '') || 'recall-set'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const answerFor = (setId: string) => (cardId: string, correct: boolean) => {
    setData((d) => withProgress(d, setId, recordAnswer(getProgress(d, setId), cardId, correct, Date.now())));
  };

  const starFor = (setId: string) => (cardId: string) => {
    setData((d) => withProgress(d, setId, toggleStar(getProgress(d, setId), cardId, Date.now())));
  };

  const bestTimeFor = (setId: string) => (ms: number) => {
    setData((d) => withProgress(d, setId, { ...getProgress(d, setId), bestMatchMs: ms }));
  };

  const saveMarkdown = (set: StudySet) => (markdown: string) => {
    setData((d) => upsertSet(d, { ...set, markdown, updatedAt: Date.now() }));
  };

  const appendNote = (set: StudySet) => (note: string) => {
    const heading = /(^|\n)## Added notes\s*(\n|$)/i.test(set.markdown) ? '' : '\n\n## Added notes';
    const markdown = `${set.markdown.trimEnd()}${heading}\n\n${note.trim()}\n`;
    setData((d) => upsertSet(d, { ...set, markdown, updatedAt: Date.now() }));
    setNotice('Note added. Your study material has been refreshed.');
  };

  const cycleTheme = () => {
    const order: Theme[] = ['auto', 'light', 'dark'];
    setData((d) => ({ ...d, theme: order[(order.indexOf(d.theme) + 1) % order.length] }));
  };

  const activeSet = route.view === 'set' ? data.sets.find((s) => s.id === route.setId) : undefined;

  useEffect(() => {
    if (route.view === 'set' && !activeSet) navigate('/');
  }, [route, activeSet]);

  const themeIcon = data.theme === 'light' ? <Sun size={16} aria-hidden /> : data.theme === 'dark' ? <Moon size={16} aria-hidden /> : <Monitor size={16} aria-hidden />;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <button type="button" className="brand" onClick={() => navigate('/')}>
            <span className="brand-badge">
              <GraduationCap size={18} aria-hidden />
            </span>
            Recall
          </button>
          <div className="header-actions">
            <SyncMenu status={syncStatus} onEnable={() => void enableSync()} onSignOut={() => void disableSync()} />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={cycleTheme}
              title={`Theme: ${data.theme}`}
              aria-label={`Theme: ${data.theme}. Click to change.`}
            >
              {themeIcon} {data.theme === 'auto' ? 'Auto' : data.theme === 'light' ? 'Light' : 'Dark'}
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        {notice && (
          <div className="notice fade-in" role="status">
            {notice}
          </div>
        )}
        {route.view === 'set' && activeSet ? (
          <SetShell
            key={activeSet.id}
            set={activeSet}
            material={materialFor(activeSet)}
            progress={getProgress(data, activeSet.id)}
            mode={route.mode}
            onNavigate={(mode) => navigate(`/set/${activeSet.id}/${mode}`)}
            onBack={() => navigate('/')}
            onAnswer={answerFor(activeSet.id)}
            onToggleStar={starFor(activeSet.id)}
            onBestTime={bestTimeFor(activeSet.id)}
            onSaveMarkdown={saveMarkdown(activeSet)}
            onAddNote={appendNote(activeSet)}
            onDelete={() => removeSet(activeSet)}
            onExport={() => exportSet(activeSet)}
          />
        ) : (
          <Library
            data={data}
            materialFor={materialFor}
            onImport={importItems}
            onLoadSample={loadSample}
            onDelete={removeSet}
            onExport={exportSet}
            onOpen={(set) => navigate(`/set/${set.id}/notes`)}
          />
        )}
      </main>

      <footer className="app-footer">
        Study sets are generated locally from your markdown. Dictation uses your browser’s speech service; Recall
        never stores the audio. Turn on Sync only when you want sets and progress on all your devices.
      </footer>
    </div>
  );
}
