// 「フォルダとして保存」ダイアログ。
// パソコン（Chrome / Edge）：OneDrive や iCloud Drive の中のフォルダを選んで直接保存（前回の保存先を覚える）
// iPad / iPhone など：フォルダをまとめた ZIP を作り、共有シートから「"ファイル"に保存」
import { Download, FolderInput, FolderOpen, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { canShareFiles, downloadFile, SaveError, shareFiles } from '../../export/exporters';
import { safeDirName } from '../../lib/folderLayout';
import { flushSave } from '../../storage/autosave';
import { canPickDirectory, ensurePermission, getSavedDir, pickDirectory, rememberSaveDir, type DirHandle } from '../../storage/fsAccess';
import { buildBundles, bundlesToZip, writeBundles, type SaveTarget } from '../../storage/projectFolder';
import { toast } from '../../store/toastStore';
import { Button, Modal } from '../ui/primitives';

export function SaveToFolderDialog({ target, onClose }: { target: SaveTarget | null; onClose: () => void }) {
  const open = !!target;
  const direct = canPickDirectory();
  const [savedDir, setSavedDir] = useState<DirHandle | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [zip, setZip] = useState<File | null>(null);
  const count = target?.projectIds.length ?? 0;

  useEffect(() => {
    if (!open) return;
    setZip(null);
    setBusy(null);
    if (direct) {
      void getSavedDir().then(setSavedDir);
      return;
    }
    // フォルダを直接選べない端末では、先に ZIP を作っておく（共有シートはボタンを押した直後にしか開けないため）
    let alive = true;
    (async () => {
      setBusy('準備中…');
      try {
        await flushSave();
        const bundles = await buildBundles(target!, (d, t) => t > 1 && alive && setBusy(`準備中… ${d}/${t}`));
        const blob = await bundlesToZip(bundles);
        if (alive) setZip(new File([blob], `${safeDirName(target!.label)}.zip`, { type: 'application/zip' }));
      } catch (e) {
        console.error(e);
        if (alive) {
          toast('準備に失敗しました：' + (e instanceof Error ? e.message : ''), 'error');
          onClose();
        }
      } finally {
        if (alive) setBusy(null);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, direct, target]);

  const saveTo = async (useSaved: boolean) => {
    try {
      const dir = useSaved && savedDir ? savedDir : await pickDirectory('readwrite', savedDir);
      if (!dir) return;
      if (!(await ensurePermission(dir, 'readwrite'))) {
        toast('フォルダへの書き込みが許可されませんでした', 'error');
        return;
      }
      void rememberSaveDir(dir);
      setSavedDir(dir);
      setBusy('保存中…');
      await flushSave();
      const bundles = await buildBundles(target!);
      const written = await writeBundles(dir, bundles, (d, t) => t > 1 && setBusy(`保存中… ${d}/${t}`));
      toast(written.length === 1 ? `「${dir.name}/${written[0]}」に保存しました` : `「${dir.name}」に${written.length}件保存しました`);
      onClose();
    } catch (e) {
      console.error(e);
      const msg =
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'このフォルダには保存できません。別のフォルダを選んでください'
          : '保存に失敗しました：' + (e instanceof Error ? e.message : '');
      toast(msg, 'error');
    } finally {
      setBusy(null);
    }
  };

  const downloadZip = async (file: File | null) => {
    try {
      let f = file;
      if (!f) {
        setBusy('準備中…');
        await flushSave();
        const blob = await bundlesToZip(await buildBundles(target!));
        f = new File([blob], `${safeDirName(target!.label)}.zip`, { type: 'application/zip' });
      }
      setBusy(null);
      await downloadFile(f, f.name);
      onClose();
    } catch (e) {
      if (!(e instanceof SaveError && e.declined)) toast('保存に失敗しました：' + (e instanceof Error ? e.message : ''), 'error');
    } finally {
      setBusy(null);
    }
  };

  const what = count > 1 ? `${count}件のプロジェクト` : 'このプロジェクト';
  const shareable = !!zip && canShareFiles([zip]);

  return (
    <Modal
      open={open}
      title="フォルダとして保存"
      onClose={onClose}
      footer={
        direct ? (
          <>
            <Button variant={savedDir ? 'secondary' : 'primary'} onClick={() => saveTo(false)} disabled={!!busy}>
              <FolderOpen size={18} /> {savedDir ? '別のフォルダを選ぶ' : 'フォルダを選ぶ'}
            </Button>
            {savedDir && (
              <Button variant="primary" onClick={() => saveTo(true)} disabled={!!busy} className="min-w-0">
                <FolderInput size={18} className="shrink-0" /> <span className="truncate">「{savedDir.name}」に保存</span>
              </Button>
            )}
          </>
        ) : (
          <>
            <Button onClick={() => downloadZip(zip)} disabled={!zip || !!busy}>
              <Download size={18} /> ダウンロード
            </Button>
            {shareable && (
              <Button
                variant="primary"
                disabled={!!busy}
                onClick={async () => {
                  if (await shareFiles([zip!])) onClose();
                  else toast('共有できませんでした。ダウンロードをお試しください', 'error');
                }}
              >
                <Share2 size={18} /> 共有して保存
              </Button>
            )}
          </>
        )
      }
    >
      <div className="space-y-3 text-[14px] leading-relaxed text-neutral-700">
        {direct ? (
          <>
            <p>
              {what}を、画像と書き込みを入れたフォルダとして保存します。保存先に <b>OneDrive</b> や <b>iCloud Drive</b>{' '}
              の中のフォルダを選ぶと、そのまま同期されてほかの端末でも開けます。
            </p>
            <p className="text-[13px] text-neutral-500">
              同じプロジェクトを同じ場所にもう一度保存すると上書きされます。
              {count > 1 && 'アプリ内のフォルダ分けもそのままフォルダになります。'}
            </p>
            <button type="button" className="text-[13px] text-[#0a84ff] underline" onClick={() => downloadZip(null)} disabled={!!busy}>
              ZIP にまとめてダウンロードする
            </button>
          </>
        ) : (
          <>
            <p>{what}を、画像と書き込みを入れたフォルダにまとめます（ZIP）。</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>{shareable ? '「共有して保存」→「"ファイル"に保存」' : '「ダウンロード」'}を押す</li>
              <li>
                <b>iCloud Drive</b> や <b>OneDrive</b> を選んで保存
              </li>
              <li>ファイルアプリで ZIP をタップするとフォルダになります</li>
            </ol>
            <p className="text-[13px] text-neutral-500">読み込むときは、ホームの「読み込む」から ZIP かフォルダを選びます。</p>
          </>
        )}
        {busy && (
          <p className="rounded-xl bg-neutral-100 px-3 py-2 text-center font-medium" role="status">
            {busy}
          </p>
        )}
      </div>
    </Modal>
  );
}
