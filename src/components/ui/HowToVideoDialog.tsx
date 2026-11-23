// 使い方動画をアプリの中で再生する。ホームと編集画面の「…」から開く。
// 動画は public/videos/howto.mp4（scripts/copy-howto-video.mjs が 使い方動画/ からコピーする）。
import { create } from 'zustand';
import { Button, Modal } from './primitives';

const VIDEO_URL = `${import.meta.env.BASE_URL}videos/howto.mp4`;

const useHowToVideo = create<{ open: boolean; failed: boolean }>()(() => ({ open: false, failed: false }));

export const openHowToVideo = () => useHowToVideo.setState({ open: true, failed: false });
const close = () => useHowToVideo.setState({ open: false });

export function HowToVideoDialog() {
  const open = useHowToVideo((s) => s.open);
  const failed = useHowToVideo((s) => s.failed);

  return (
    <Modal open={open} title="使い方動画" onClose={close} wide footer={<Button onClick={close}>閉じる</Button>}>
      {failed ? (
        <p className="text-[15px] leading-relaxed text-neutral-600">
          動画を読み込めませんでした。動画はインターネットにつながっているときに見られます。
        </p>
      ) : (
        <video
          src={VIDEO_URL}
          controls
          playsInline
          preload="metadata"
          onError={() => useHowToVideo.setState({ failed: true })}
          className="aspect-video w-full rounded-xl bg-black"
        />
      )}
    </Modal>
  );
}
