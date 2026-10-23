// ツールごとの設定（直前の設定を保持）とアプリ設定。localStorage に永続化する。
// サイズ系の値は「表示単位」（ページ長辺=1000 基準）で保持し、配置時に画像pxへ換算する。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DashStyle, FontKey, TextAlign } from '../types/model';

export interface TextToolSettings {
  fontFamily: FontKey;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
  background: string | null;
  outlineColor: string | null;
  outlineWidth: number;
  opacity: number;
  vertical: boolean;
  letterSpacing: number;
  lineHeight: number;
  backgroundOpacity: number;
  outlineOpacity: number;
}

export interface ToolSettings {
  text: TextToolSettings;
  math: { fontSize: number; color: string; opacity: number };
  pen: { color: string; width: number; opacity: number };
  highlighter: { color: string; width: number; opacity: number; straight: boolean };
  line: { color: string; width: number; dash: DashStyle; opacity: number };
  arrow: { color: string; width: number; dash: DashStyle; double: boolean; arrowSize: number; opacity: number };
  shape: {
    strokeColor: string | null;
    strokeWidth: number;
    fill: string | null;
    fillOpacity: number;
    dash: DashStyle;
    opacity: number;
  };
}

export type ToolSettingsKey = keyof ToolSettings;

export interface AppSettings {
  /** ペン入力のみ描画（指はスクロール・移動） */
  penOnly: boolean;
  /** 水平・垂直への自動吸着 */
  angleSnap: boolean;
  /** UIを大きく表示 */
  largeUI: boolean;
}

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  text: {
    fontFamily: 'gothic',
    fontSize: 24,
    color: '#000000',
    bold: false,
    italic: false,
    align: 'left',
    background: null,
    outlineColor: null,
    outlineWidth: 2,
    opacity: 1,
    vertical: false,
    letterSpacing: 0,
    lineHeight: 1.25,
    backgroundOpacity: 1,
    outlineOpacity: 1,
  },
  math: { fontSize: 28, color: '#e5352b', opacity: 1 },
  pen: { color: '#e5352b', width: 3, opacity: 1 },
  highlighter: { color: '#ffe14d', width: 18, opacity: 0.6, straight: false },
  line: { color: '#e5352b', width: 3, dash: 'solid', opacity: 1 },
  arrow: { color: '#e5352b', width: 3, dash: 'solid', double: false, arrowSize: 14, opacity: 1 },
  shape: { strokeColor: '#e5352b', strokeWidth: 3, fill: null, fillOpacity: 0.3, dash: 'solid', opacity: 1 },
};

interface SettingsState {
  tools: ToolSettings;
  app: AppSettings;
  setTool: <K extends ToolSettingsKey>(key: K, patch: Partial<ToolSettings[K]>) => void;
  setApp: (patch: Partial<AppSettings>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      tools: DEFAULT_TOOL_SETTINGS,
      app: { penOnly: false, angleSnap: true, largeUI: false },
      setTool: (key, patch) => set((s) => ({ tools: { ...s.tools, [key]: { ...s.tools[key], ...patch } } })),
      setApp: (patch) => set((s) => ({ app: { ...s.app, ...patch } })),
    }),
    {
      name: 'mojiire-settings',
      version: 2,
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as { tools?: { text?: { color?: string } } };
        // v1 までの文字色の既定値（赤）は黒に変更
        if (version < 2 && p.tools?.text?.color?.toLowerCase() === '#e5352b') p.tools.text.color = '#000000';
        return p as never;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        const tools = { ...current.tools };
        for (const k of Object.keys(tools) as ToolSettingsKey[]) {
          // 新しい設定項目が増えても既定値で補完する
          (tools as Record<string, unknown>)[k] = { ...current.tools[k], ...(p.tools?.[k] ?? {}) };
        }
        return { ...current, tools, app: { ...current.app, ...(p.app ?? {}) } };
      },
    },
  ),
);
