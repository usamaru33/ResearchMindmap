import { makeTranslate, type Lang, type Translate } from '.';

// Non-React code (API client, stores, exporters) has no hook access, so the
// settings provider mirrors the chosen language here.
let current: Lang = 'ja';

export function setCurrentLang(lang: Lang): void {
  current = lang;
}

/** Translate with the language currently shown in the UI. */
export const tr: Translate = (key, vars) => makeTranslate(current)(key, vars);
