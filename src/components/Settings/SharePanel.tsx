import { useEffect, useState } from 'react';
import { describeSyncError, type GoogleSync, type ShareInfo } from '../../hooks/useGoogleSync';
import { useT } from '../../hooks/useT';
import type { Person, ShareRole } from '../../sync/drive';
import styles from './SettingsDialog.module.css';

const roleKey = (role: Person['role']) =>
  role === 'owner' || role === 'organizer' || role === 'fileOrganizer'
    ? 'sync.share.role.owner'
    : role === 'writer'
      ? 'sync.share.role.writer'
      : role === 'reader' || role === 'commenter'
        ? 'sync.share.role.reader'
        : 'sync.share.role.other';

interface SharePanelProps {
  sync: GoogleSync;
  projectId: string;
}

/** Who the open project is shared with, and a way to add or remove people (DESIGN 16.5). */
export function SharePanel({ sync, projectId }: SharePanelProps) {
  const t = useT();
  const { people, share, unshare } = sync;
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ShareRole>('reader');
  const [busy, setBusy] = useState(false);

  // Bumped after a change, to read the list again.
  const [reload, setReload] = useState(0);

  // Not while a sync runs: the project may be on its way to Drive.
  const ready = sync.status === 'idle';

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    people(projectId).then(
      (loaded) => {
        if (cancelled) return;
        setInfo(loaded);
        setError(null);
      },
      (err) => {
        if (!cancelled) setError(describeSyncError(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [people, projectId, reload, ready]);

  const run = async (action: () => Promise<void>, done?: string) => {
    setBusy(true);
    setNote(null);
    try {
      await action();
      setError(null);
      if (done) setNote(done);
      setReload((n) => n + 1);
    } catch (err) {
      setError(describeSyncError(err));
    } finally {
      setBusy(false);
    }
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const to = email.trim();
    if (!to) return;
    void run(async () => {
      await share(projectId, to, role);
      setEmail('');
    }, t('sync.share.done', { email: to }));
  };

  return (
    <div className={styles.share}>
      <h5>{t('sync.share.title')}</h5>
      {info === null && !error && <div className={styles.hint}>{t('sync.share.loading')}</div>}
      {info && (
        <>
          {info.people.filter((p) => roleKey(p.role) !== 'sync.share.role.owner').length === 0 && <div className={styles.hint}>{t('sync.share.nobody')}</div>}
          <ul className={styles.people}>
            {info.people.map((p) => (
              <li key={p.id} className={styles.person}>
                <span className={styles.personName} title={p.email}>
                  {p.name === p.email ? p.email : `${p.name} (${p.email})`}
                </span>
                <span className={styles.personRole}>{t(roleKey(p.role))}</span>
                {info.ownedByMe && roleKey(p.role) !== 'sync.share.role.owner' && (
                  <button
                    type="button"
                    className={styles.reset}
                    disabled={busy}
                    title={t('sync.share.removeTitle', { email: p.email })}
                    onClick={() => void run(() => unshare(projectId, p.id))}
                  >
                    {t('sync.share.remove')}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {info.ownedByMe ? (
            <form className={styles.shareForm} onSubmit={add}>
              <input
                type="email"
                className={styles.shareEmail}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('sync.share.email')}
                aria-label={t('sync.share.email')}
                required
              />
              <select value={role} onChange={(e) => setRole(e.target.value === 'writer' ? 'writer' : 'reader')} aria-label={t('sync.share.role')}>
                <option value="reader">{t('sync.share.reader')}</option>
                <option value="writer">{t('sync.share.writer')}</option>
              </select>
              <button type="submit" className={styles.syncBtn} disabled={busy || !email.trim()}>
                {busy ? t('sync.share.adding') : t('sync.share.add')}
              </button>
            </form>
          ) : (
            <div className={styles.hint}>{t('sync.share.notOwner')}</div>
          )}
        </>
      )}
      {note && (
        <div className={styles.hint} role="status">
          {note}
        </div>
      )}
      {error && (
        <div className={styles.syncError} role="alert">
          {error}
        </div>
      )}
      <p className={styles.hint}>{t('sync.share.hint')}</p>
    </div>
  );
}
