import { create } from 'zustand';
import type { BrandKit, DictionaryEntry, Project } from '../core/types';
import { db, type Settings, DEFAULT_SETTINGS } from '../services/db';
import { setEngineChoice } from '../asr/engine';

const HISTORY_LIMIT = 60;

interface AppState {
  ready: boolean;
  projects: Project[];
  current: Project | null;
  past: Project[];
  future: Project[];
  settings: Settings;
  dictionary: DictionaryEntry[];
  brand: BrandKit | null;
  toast: string | null;

  init(): Promise<void>;
  refreshProjects(): Promise<void>;
  open(p: Project): void;
  close(): void;
  /** Apply an edit to the open project. `undoable` edits go to the undo stack. */
  edit(fn: (p: Project) => Project, undoable?: boolean): void;
  undo(): void;
  redo(): void;
  setSettings(s: Partial<Settings>): Promise<void>;
  setDictionary(d: DictionaryEntry[]): Promise<void>;
  setBrand(b: BrandKit): Promise<void>;
  showToast(msg: string): void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: Project | null = null;

function scheduleSave(p: Project) {
  pendingSave = p;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 400);
}

export async function flushSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const p = pendingSave;
  pendingSave = null;
  if (p) await db.saveProject(p);
}

// Don't lose edits when the app goes to the background or closes.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushSave();
  });
  window.addEventListener('pagehide', () => void flushSave());
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  projects: [],
  current: null,
  past: [],
  future: [],
  settings: DEFAULT_SETTINGS,
  dictionary: [],
  brand: null,
  toast: null,

  async init() {
    const [projects, settings, dictionary, brand] = await Promise.all([
      db.listProjects(),
      db.getSettings(),
      db.getDictionary(),
      db.getBrand(),
    ]);
    setEngineChoice(settings.engine);
    set({ projects, settings, dictionary, brand, ready: true });
  },
  async refreshProjects() {
    await flushSave();
    set({ projects: await db.listProjects() });
  },
  open(p) {
    set({ current: p, past: [], future: [] });
  },
  close() {
    void flushSave().then(() => get().refreshProjects());
    set({ current: null, past: [], future: [] });
  },
  edit(fn, undoable = true) {
    const cur = get().current;
    if (!cur) return;
    const next = { ...fn(cur), updatedAt: Date.now() };
    set((s) => ({
      current: next,
      past: undoable ? [...s.past, cur].slice(-HISTORY_LIMIT) : s.past,
      future: undoable ? [] : s.future,
    }));
    scheduleSave(next);
  },
  undo() {
    const { past, current, future } = get();
    if (!past.length || !current) return;
    const prev = past[past.length - 1];
    set({ current: prev, past: past.slice(0, -1), future: [current, ...future] });
    scheduleSave(prev);
  },
  redo() {
    const { past, current, future } = get();
    if (!future.length || !current) return;
    const next = future[0];
    set({ current: next, past: [...past, current], future: future.slice(1) });
    scheduleSave(next);
  },
  async setSettings(s) {
    const settings = { ...get().settings, ...s };
    setEngineChoice(settings.engine);
    set({ settings });
    await db.saveSettings(settings);
  },
  async setDictionary(d) {
    set({ dictionary: d });
    await db.saveDictionary(d);
  },
  async setBrand(b) {
    set({ brand: b });
    await db.saveBrand(b);
  },
  showToast(msg) {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = setTimeout(() => set({ toast: null }), 3200);
  },
}));
