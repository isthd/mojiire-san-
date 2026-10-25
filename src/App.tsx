import { useEffect, useState } from 'react';
import { Editor } from './components/editor/Editor';
import { HomeScreen } from './components/home/HomeScreen';
import { NewsDialog } from './components/ui/NewsDialog';
import { Toasts } from './components/ui/Overlays';
import { useSettings } from './store/settingsStore';

/** #/p/<projectId> で編集画面（再読み込みしても同じプロジェクトを開く） */
function parseHash(): string | null {
  const m = /^#\/p\/([\w-]+)$/.exec(window.location.hash);
  return m ? m[1] : null;
}

export default function App() {
  const [projectId, setProjectId] = useState<string | null>(parseHash);
  const largeUI = useSettings((s) => s.app.largeUI);

  useEffect(() => {
    const onHash = () => setProjectId(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('large-ui', largeUI);
  }, [largeUI]);

  const open = (id: string) => {
    window.location.hash = `#/p/${id}`;
  };
  const home = () => {
    window.location.hash = '';
  };

  return (
    <>
      {projectId ? <Editor key={projectId} projectId={projectId} onHome={home} /> : <HomeScreen onOpen={open} />}
      <Toasts />
      <NewsDialog />
    </>
  );
}
