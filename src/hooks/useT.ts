import { useMemo } from 'react';
import { makeTranslate, type Lang, type Translate } from '../i18n';
import { useSettings } from './settingsContext';

/** The translate function for the current UI language. */
export function useT(): Translate & { lang: Lang } {
  const lang = useSettings().settings.uiLanguage;
  return useMemo(() => Object.assign(makeTranslate(lang), { lang }), [lang]);
}
