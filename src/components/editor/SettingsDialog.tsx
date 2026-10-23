import { DEFAULT_TOOL_SETTINGS, useSettings } from '../../store/settingsStore';
import { useEditor } from '../../store/editorStore';
import { toast } from '../../store/toastStore';
import { Button, Modal, Toggle } from '../ui/primitives';

export function SettingsDialog() {
  const open = useEditor((s) => s.modal === 'settings');
  const setModal = useEditor((s) => s.setModal);
  const app = useSettings((s) => s.app);
  const setApp = useSettings((s) => s.setApp);
  return (
    <Modal open={open} title="設定" onClose={() => setModal(null)}>
      <div className="divide-y divide-neutral-200">
        <div className="py-2">
          <Toggle label="ペン入力のみで描画（Apple Pencil用）" checked={app.penOnly} onChange={(penOnly) => setApp({ penOnly })} />
          <p className="pb-2 text-xs text-neutral-500">オンにすると、指で触れても線は描かれず、画面の移動になります。手のひらの誤タッチを防げます。</p>
        </div>
        <div className="py-2">
          <Toggle label="水平・垂直に自動でそろえる" checked={app.angleSnap} onChange={(angleSnap) => setApp({ angleSnap })} />
          <p className="pb-2 text-xs text-neutral-500">直線・矢印が水平・垂直に近いとき自動で吸着します。Shiftキーで15°刻みに固定できます。</p>
        </div>
        <div className="py-2">
          <Toggle label="ボタンや文字を大きく表示" checked={app.largeUI} onChange={(largeUI) => setApp({ largeUI })} />
        </div>
        <div className="space-y-2 py-3">
          <div className="text-[14px]">ツールの設定（色・サイズなど）を初期状態に戻す</div>
          <Button
            onClick={() => {
              useSettings.setState({ tools: DEFAULT_TOOL_SETTINGS });
              toast('ツールの設定を初期化しました');
            }}
          >
            初期化
          </Button>
        </div>
        <div className="py-3 text-xs leading-relaxed text-neutral-500">
          編集内容はこの端末のブラウザ内にのみ保存され、外部には送信されません。端末を変える場合はホーム画面の「バックアップ」を利用してください。
          <br />
          ショートカット：Ctrl+Z 元に戻す / Ctrl+Y やり直す / Ctrl+C コピー / Ctrl+V 貼り付け / Ctrl+D 複製 / Delete 削除 / Esc 選択解除 / Space+ドラッグ 移動 / Ctrl+0 画面に合わせる
        </div>
      </div>
    </Modal>
  );
}
