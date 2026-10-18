import { useEffect, useRef } from 'react';
import type { MessageKey } from '../i18n';

export interface ShortcutHandlers {
  undo: () => void;
  redo: () => void;
  openSearch: () => void;
  fitView: () => void;
  toggleHelp: () => void;
  closePanels: () => void;
  openPalette: () => void;
}

export const SHORTCUTS: Array<{ keys: string; label: MessageKey }> = [
  { keys: 'Ctrl / ⌘ + Z', label: 'shortcuts.undo' },
  { keys: 'Ctrl / ⌘ + Shift + Z, Ctrl + Y', label: 'shortcuts.redo' },
  { keys: '/', label: 'shortcuts.search' },
  { keys: 'F', label: 'shortcuts.fit' },
  { keys: 'Delete / Backspace', label: 'shortcuts.delete' },
  { keys: 'Esc', label: 'shortcuts.close' },
  { keys: 'Ctrl / ⌘ + Enter', label: 'shortcuts.run' },
  { keys: 'I / M / E', label: 'shortcuts.screen' },
  { keys: 'Ctrl / ⌘ + K', label: 'shortcuts.palette' },
  { keys: 'Double-click', label: 'shortcuts.note' },
  { keys: '?', label: 'shortcuts.help' },
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
      const h = ref.current;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      // The palette opens from anywhere, even while typing.
      if (mod && !e.shiftKey && !e.altKey && key === 'k') {
        e.preventDefault();
        h.openPalette();
        return;
      }
      if (isTyping(e.target)) return;
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
