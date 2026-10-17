import type { SourceName, SourceStatus } from '../../shared/types';
import type { AppConfig } from '../config';
import { arxivSource } from './arxiv';
import { crossrefSource } from './crossref';
import { openAlexSource } from './openalex';
import { pubmedSource } from './pubmed';
import { semanticScholarSource } from './semanticscholar';
import type { SourceAdapter } from './types';

export const SOURCES: SourceAdapter[] = [
  openAlexSource,
  semanticScholarSource,
  crossrefSource,
  arxivSource,
  pubmedSource,
];

export function getSource(name: SourceName): SourceAdapter | undefined {
  return SOURCES.find((s) => s.name === name);
}

export function sourceStatuses(config: AppConfig): SourceStatus[] {
  return SOURCES.map((s) => ({ name: s.name, label: s.label, ...s.status(config) }));
}
