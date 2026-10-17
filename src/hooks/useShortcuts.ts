import { useEffect, useRef } from 'react';

export interface ShortcutHandlers {
  undo: () => void;
  redo: () => void;
  openSearch: () => void;
  fitView: () => void;
  toggleHelp: () => void;
  closePanels: () => void;
}

export const SHORTCUTS: Array<{ keys: string; label: string }> = [
  { keys: 'Ctrl / ⌘ + Z', label: '元に戻す' },
  { keys: 'Ctrl / ⌘ + Shift + Z, Ctrl + Y', label: 'やり直す' },
  { keys: '/', label: '検索パネルを開いてクエリ欄へ' },
  { keys: 'F', label: '全体を表示' },
  { keys: 'Delete / Backspace', label: '選んだ論文・エッジを削除' },
  { keys: 'Esc', label: 'パネル・選択を閉じる' },
  { keys: 'Ctrl / ⌘ + Enter', label: '検索欄で検索を実行' },
  { keys: 'I / M / E', label: 'スクリーニングで採用 / 保留 / 除外' },
  { keys: '?', label: 'このショートカット一覧' },
];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

/** App-wide keyboard shortcuts; ignored while typing (except undo/redo outside fields). */
export function useShortcuts(handlers: ShortcutHandlers): void {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const h = ref.current;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) h.redo();
        else h.undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        h.redo();
      } else if (!mod && !e.altKey) {
        if (e.key === '/') {
          e.preventDefault();
          h.openSearch();
        } else if (e.key === '?') {
          e.preventDefault();
          h.toggleHelp();
        } else if (key === 'f' && !e.shiftKey) {
          h.fitView();
        } else if (e.key === 'Escape') {
          h.closePanels();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
