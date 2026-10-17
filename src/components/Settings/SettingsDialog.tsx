import { useEffect } from 'react';
import { useApiHealth } from '../../hooks/useApiHealth';
import { useSettings } from '../../hooks/settingsContext';
import { DEFAULT_SETTINGS, SOURCE_LIMIT_OPTIONS, VAGUE_LIMIT_OPTIONS } from '../../store/settings';
import styles from './SettingsDialog.module.css';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const health = useApiHealth();
  const { settings, update } = useSettings();
  const excluded = new Set(settings.excludedSources);

  // The global Escape shortcut ignores form fields, and this dialog is mostly form fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.dialog} role="dialog" aria-label="Settings">
        <div className={styles.header}>
          <h3>Settings</h3>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <section className={styles.section}>
          <h4>API の状態</h4>
          {health.status === 'loading' && <p className={styles.muted}>確認中…</p>}
          {health.status === 'error' && <p className={styles.error}>API サーバーに接続できません: {health.message}</p>}
          {health.status === 'ok' && (
            <ul className={styles.status}>
              {health.health.sources.map((s) => (
                <li key={s.name}>
                  <span className={s.enabled ? styles.dotOn : styles.dotOff} aria-hidden />
                  <span className={styles.name}>{s.label}</span>
                  <span className={styles.muted}>{s.reason ?? (s.enabled ? '利用可能' : '無効')}</span>
                </li>
              ))}
              <li>
                <span className={health.health.llm.enabled ? styles.dotOn : styles.dotOff} aria-hidden />
                <span className={styles.name}>Claude</span>
                <span className={styles.muted}>
                  {health.health.llm.enabled ? health.health.llm.model : (health.health.llm.reason ?? 'ANTHROPIC_API_KEY が未設定です')}
                </span>
              </li>
            </ul>
          )}
          <p className={styles.hint}>API キーはサーバー側の .env で設定します（ブラウザには保存しません）。</p>
        </section>

        <section className={styles.section}>
          <h4>検索の既定値</h4>
          {health.status === 'ok' && (
            <div className={styles.row}>
              <span className={styles.label}>使うデータベース</span>
              <div className={styles.chips}>
                {health.health.sources
                  .filter((s) => s.enabled)
                  .map((s) => (
                    <label key={s.name} className={styles.check}>
                      <input
                        type="checkbox"
                        checked={!excluded.has(s.name)}
                        onChange={() =>
                          update({
                            excludedSources: excluded.has(s.name)
                              ? settings.excludedSources.filter((n) => n !== s.name)
                              : [...settings.excludedSources, s.name],
                          })
                        }
                      />
                      {s.label}
                    </label>
                  ))}
              </div>
            </div>
          )}
          <label className={styles.row}>
            <span className={styles.label}>1 データベースあたりの件数</span>
            <select value={settings.limitPerSource} onChange={(e) => update({ limitPerSource: Number(e.target.value) })}>
              {SOURCE_LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.row}>
            <span className={styles.label}>なんとなく検索の件数</span>
            <select value={settings.vagueLimit} onChange={(e) => update({ vagueLimit: Number(e.target.value) })}>
              {VAGUE_LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className={styles.section}>
          <h4>AI</h4>
          <label className={styles.row}>
            <span className={styles.label}>Claude を使う（キーがあるとき）</span>
            <input type="checkbox" checked={settings.useLlm} onChange={(e) => update({ useLlm: e.target.checked })} />
          </label>
          <label className={styles.row}>
            <span className={styles.label}>AI が書く文章の言語</span>
            <select value={settings.aiLanguage} onChange={(e) => update({ aiLanguage: e.target.value === 'en' ? 'en' : 'ja' })}>
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </select>
          </label>
        </section>

        <div className={styles.footer}>
          <button type="button" className={styles.reset} onClick={() => update(DEFAULT_SETTINGS)}>
            既定値に戻す
          </button>
        </div>
      </div>
    </>
  );
}
