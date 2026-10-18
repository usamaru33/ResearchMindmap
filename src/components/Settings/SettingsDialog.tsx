import { useEffect } from 'react';
import { useApiHealth } from '../../hooks/useApiHealth';
import { localizedReason } from '../../i18n/localized';
import { useSettings } from '../../hooks/settingsContext';
import { DEFAULT_SETTINGS, SOURCE_LIMIT_OPTIONS, VAGUE_LIMIT_OPTIONS } from '../../store/settings';
import { useT } from '../../hooks/useT';
import styles from './SettingsDialog.module.css';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const health = useApiHealth();
  const { settings, update } = useSettings();
  const t = useT();
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
      <div className={styles.dialog} role="dialog" aria-label={t('settings.title')}>
        <div className={styles.header}>
          <h3>{t('settings.title')}</h3>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>

        <section className={styles.section}>
          <h4>{t('settings.api')}</h4>
          {health.status === 'loading' && <p className={styles.muted}>{t('settings.checking')}</p>}
          {health.status === 'error' && <p className={styles.error}>{t('settings.unreachable', { message: health.message })}</p>}
          {health.status === 'ok' && (
            <ul className={styles.status}>
              {health.health.sources.map((s) => (
                <li key={s.name}>
                  <span className={s.enabled ? styles.dotOn : styles.dotOff} aria-hidden />
                  <span className={styles.name}>{s.label}</span>
                  <span className={styles.muted}>{localizedReason(s, t.lang) ?? (s.enabled ? t('settings.available') : t('settings.disabled'))}</span>
                </li>
              ))}
              <li>
                <span className={health.health.llm.enabled ? styles.dotOn : styles.dotOff} aria-hidden />
                <span className={styles.name}>Claude</span>
                <span className={styles.muted}>
                  {health.health.llm.enabled ? health.health.llm.model : (localizedReason(health.health.llm, t.lang) ?? t('settings.noKey'))}
                </span>
              </li>
            </ul>
          )}
          <p className={styles.hint}>{t('settings.keysHint')}</p>
        </section>

        <section className={styles.section}>
          <h4>{t('settings.search')}</h4>
          {health.status === 'ok' && (
            <div className={styles.row}>
              <span className={styles.label}>{t('settings.databases')}</span>
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
            <span className={styles.label}>{t('settings.perSource')}</span>
            <select value={settings.limitPerSource} onChange={(e) => update({ limitPerSource: Number(e.target.value) })}>
              {SOURCE_LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.row}>
            <span className={styles.label}>{t('settings.vague')}</span>
            <select value={settings.vagueLimit} onChange={(e) => update({ vagueLimit: Number(e.target.value) })}>
              {VAGUE_LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.row}>
            <span className={styles.label}>{t('settings.autoCheck')}</span>
            <input type="checkbox" checked={settings.autoCheckAlerts} onChange={(e) => update({ autoCheckAlerts: e.target.checked })} />
          </label>
        </section>

        <section className={styles.section}>
          <h4>{t('settings.ai')}</h4>
          <label className={styles.row}>
            <span className={styles.label}>{t('settings.useLlm')}</span>
            <input type="checkbox" checked={settings.useLlm} onChange={(e) => update({ useLlm: e.target.checked })} />
          </label>
          <label className={styles.row}>
            <span className={styles.label}>{t('settings.aiLanguage')}</span>
            <select value={settings.aiLanguage} onChange={(e) => update({ aiLanguage: e.target.value === 'en' ? 'en' : 'ja' })}>
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </select>
          </label>
        </section>

        <section className={styles.section}>
          <h4>{t('settings.display')}</h4>
          <label className={styles.row}>
            <span className={styles.label}>{t('settings.uiLanguage')} / Language</span>
            <select value={settings.uiLanguage} onChange={(e) => update({ uiLanguage: e.target.value === 'en' ? 'en' : 'ja' })}>
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </select>
          </label>
        </section>

        <div className={styles.footer}>
          <button type="button" className={styles.reset} onClick={() => update({ ...DEFAULT_SETTINGS, uiLanguage: settings.uiLanguage })}>
            {t('settings.reset')}
          </button>
        </div>
      </div>
    </>
  );
}
