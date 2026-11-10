import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { useApp } from './state/store';
import { Home } from './screens/Home';
import { Editor } from './editor/Editor';
import { BrandScreen, DictionaryScreen, SettingsScreen } from './screens/Library';
import { registerBuiltinFonts, ensureFont } from './services/fonts';
import { requestPersistence } from './services/db';

document.documentElement.dir = 'rtl';
document.documentElement.lang = 'he';
registerBuiltinFonts();

/** Phones keep old copies of the page for a while; load the newest version as soon as it exists. */
const APP_VERSION = '12';
void fetch(new URL('version.json?t=' + Date.now(), document.baseURI).toString(), { cache: 'no-store' })
  .then((r) => (r.ok ? r.json() : null))
  .then((j: { v?: string } | null) => {
    if (!j?.v || j.v === APP_VERSION) return;
    const key = 'mila-reloaded-for-' + j.v;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      return;
    }
    location.replace(location.pathname + '?v=' + j.v);
  })
  .catch(() => undefined);
void ensureFont('Heebo-Regular');
void ensureFont('Heebo-Bold');
void ensureFont('SecularOne-Regular');

type Screen = 'home' | 'brand' | 'dictionary' | 'settings';

function App() {
  const { ready, init, current, toast } = useApp();
  const [screen, setScreen] = useState<Screen>('home');
  useEffect(() => {
    void init();
    void requestPersistence();
  }, [init]);
  if (!ready) return null;
  const back = () => setScreen('home');
  return (
    <>
      {current ? (
        <Editor />
      ) : screen === 'brand' ? (
        <BrandScreen back={back} />
      ) : screen === 'dictionary' ? (
        <DictionaryScreen back={back} />
      ) : screen === 'settings' ? (
        <SettingsScreen back={back} />
      ) : (
        <Home go={setScreen} />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
