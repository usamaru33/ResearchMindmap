import { format, type Entry, type Lang, type Vars } from './format';
import { chrome } from './messages/chrome';
import { map } from './messages/map';
import { paper } from './messages/paper';
import { forms } from './messages/forms';
import { search } from './messages/search';
import { work } from './messages/work';
import { errors } from './messages/errors';
import { recommend } from './messages/recommend';
import { alerts } from './messages/alerts';
import { check } from './messages/check';
import { analysis } from './messages/analysis';
import { notes } from './messages/notes';

export { detectLang, format, type Lang } from './format';

export const MESSAGES = {
  ...chrome,
  ...map,
  ...paper,
  ...forms,
  ...search,
  ...work,
  ...errors,
  ...recommend,
  ...alerts,
  ...check,
  ...analysis,
  ...notes,
} as const satisfies Record<string, Entry>;

export type MessageKey = keyof typeof MESSAGES;
export type Translate = (key: MessageKey, vars?: Vars) => string;

export function makeTranslate(lang: Lang): Translate {
  const i = lang === 'ja' ? 0 : 1;
  return (key, vars) => format(MESSAGES[key][i], vars);
}
