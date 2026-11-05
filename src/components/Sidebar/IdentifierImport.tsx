import { useId, useRef, useState } from 'react';
import type { Paper, ResolveItem, ResolveResponse } from '../../../shared/types';
import { apiPost } from '../../api/client';
import { truncateAuthors } from '../../utils/helpers';
import { extractReferences } from '../../utils/pdfReferences';
import { MAX_PDF_BYTES, readPdfPages } from '../../utils/pdfText';
import { splitReferences } from '../../utils/referenceList';
import { useT } from '../../hooks/useT';
import styles from './Sidebar.module.css';

const KIND_LABEL: Record<Exclude<NonNullable<ResolveItem['kind']>, 'title' | 'citation'>, string> = {
  doi: 'DOI',
  arxiv: 'arXiv',
  openalex: 'OpenAlex',
  pmid: 'PubMed',
};

interface IdentifierImportProps {
  /** identifiers: one id or title per line; references: a pasted bibliography. */
  mode: 'identifiers' | 'references';
  mapIds: Set<string>;
  onAdd: (papers: Paper[]) => void;
}

export function IdentifierImport({ mode, mapIds, onAdd }: IdentifierImportProps) {
  const t = useT();
  const id = useId();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ResolveItem[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [pdfStatus, setPdfStatus] = useState<{ kind: 'reading' | 'found' | 'error'; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const lines = mode === 'references' ? splitReferences(text) : text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const readPdf = async (file: File) => {
    setItems(null);
    setError(null);
    if (file.size > MAX_PDF_BYTES) {
      setPdfStatus({ kind: 'error', text: t('import.pdfTooBig') });
      return;
    }
    setPdfStatus({ kind: 'reading', text: t('import.pdfReading') });
    try {
      const found = extractReferences(await readPdfPages(await file.arrayBuffer()));
      if (found.ok) {
        setText(found.text);
        setPdfStatus({ kind: 'found', text: t('import.pdfFound', { n: found.lines }) });
      } else {
        setPdfStatus({ kind: 'error', text: found.reason === 'no-text' ? t('import.pdfNoText') : t('import.pdfNoHeading') });
      }
    } catch {
      setPdfStatus({ kind: 'error', text: t('import.pdfFailed') });
    }
  };

  const resolve = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiPost<ResolveResponse>('/api/resolve', { inputs: lines.slice(0, 100) });
      setItems(res.items);
      // Uncertain matches are offered but not ticked.
      setSelected(new Set(res.items.map((it, i) => (it.ok && it.confidence !== 'low' ? i : -1)).filter((i) => i >= 0)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
  };

  const add = () => {
    if (!items) return;
    onAdd(items.filter((it, i) => it.ok && it.paper && selected.has(i)).map((it) => it.paper!));
    setItems(null);
    setText('');
  };

  const failed = items?.filter((it) => !it.ok).length ?? 0;

  return (
    <div className={styles.importPanel}>
      {mode === 'references' && (
        <>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void readPdf(file);
            }}
          />
          <button type="button" className={styles.importBtn} onClick={() => fileInput.current?.click()} disabled={pdfStatus?.kind === 'reading'}>
            {pdfStatus?.kind === 'reading' ? t('import.pdfReading') : t('import.pdf')}
          </button>
          {pdfStatus?.kind === 'error' ? (
            <div className={styles.importError} role="alert">
              {pdfStatus.text}
            </div>
          ) : (
            <div className={styles.importNote} role="status">
              {pdfStatus?.kind === 'found' ? pdfStatus.text : t('import.pdfLocal')}
            </div>
          )}
        </>
      )}
      <label className={styles.importLabel} htmlFor={id}>
        {mode === 'references' ? t('import.refLabel') : t('import.label')}
      </label>
      <textarea
        id={id}
        className={styles.importInput}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          mode === 'references'
            ? '[1] A. Vaswani et al., “Attention is all you need,” in Proc. NeurIPS, 2017.\n[2] He, K., Zhang, X., Ren, S., & Sun, J. (2016). Deep residual learning for image recognition. In CVPR.'
            : '10.1145/3313831.3376358\nhttps://arxiv.org/abs/1706.03762\nDeep Residual Learning for Image Recognition'
        }
        spellCheck={false}
      />
      <button type="button" className={styles.importBtn} onClick={resolve} disabled={loading || lines.length === 0}>
        {loading ? t('import.resolving') : lines.length ? t('import.resolveN', { n: lines.length }) : t('import.resolve')}
      </button>
      {mode === 'references' && lines.length > 0 && !items && <div className={styles.importNote}>{t('import.split', { n: lines.length })}</div>}
      {lines.length > 100 && <div className={styles.importNote}>{t('import.tooMany')}</div>}
      {error && <div className={styles.importError}>{error}</div>}

      {items && (
        <>
          <div className={styles.importNote}>
            {t('import.found', { n: items.length - failed })}
            {failed > 0 && t('import.notFound', { n: failed })}
          </div>
          <ul className={styles.importList}>
            {items.map((it, i) => (
              <li key={i} className={`${styles.importItem} ${it.ok ? '' : styles.importItemFailed}`}>
                {it.ok && it.paper ? (
                  <label>
                    <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                    <span>
                      <span className={styles.importTitle}>
                        {it.paper.year ? `${it.paper.year} · ` : ''}
                        {it.paper.title}
                      </span>
                      <span className={styles.importMeta}>
                        {it.kind && (it.kind === 'title' ? t('import.kind.title') : it.kind === 'citation' ? t('import.kind.citation') : KIND_LABEL[it.kind])} · {truncateAuthors(it.paper.authors, 2)}
                        {mapIds.has(it.paper.id) && ` · ${t('import.inMap')}`}
                        {it.confidence === 'low' && (
                          <span className={styles.importCheck} title={t('import.checkTitle')}>
                            {t('import.check')}
                          </span>
                        )}
                      </span>
                      {mode === 'references' && <span className={styles.importSource}>{it.input}</span>}
                    </span>
                  </label>
                ) : (
                  <span>
                    <span className={styles.importTitle}>{it.input}</span>
                    <span className={styles.importMeta}>{it.error}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className={styles.importBtn} onClick={add} disabled={selected.size === 0}>
            {t('import.add', { n: selected.size })}
          </button>
        </>
      )}
    </div>
  );
}
