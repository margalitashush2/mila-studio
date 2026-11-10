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
