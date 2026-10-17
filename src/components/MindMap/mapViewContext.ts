import { createContext, useContext } from 'react';
import type { Paper, SourceName } from '../../../shared/types';
import { getYearColor } from '../../utils/helpers';
import { statusInfo } from '../../utils/reading';

export type ColorMode = 'year' | 'cluster' | 'status' | 'source' | 'screening';

export interface MapView {
  colorMode: ColorMode;
  sizeByCitations: boolean;
  /** Ids that match the map filter, or null when no filter is active. */
  highlight: Set<string> | null;
  maxCitations: number;
}

export const DEFAULT_VIEW: MapView = { colorMode: 'year', sizeByCitations: false, highlight: null, maxCitations: 0 };

export const MapViewContext = createContext<MapView>(DEFAULT_VIEW);

export function useMapView(): MapView {
  return useContext(MapViewContext);
}

export const SCREENING_COLORS: Record<string, string> = {
  include: '#10b981',
  maybe: '#f59e0b',
  exclude: '#ef4444',
  pending: '#cbd5e1',
};

export const SOURCE_COLORS: Record<SourceName, string> = {
  openalex: '#6366f1',
  semanticscholar: '#0ea5e9',
  crossref: '#f59e0b',
  arxiv: '#b91c1c',
  pubmed: '#059669',
  ieee: '#2563eb',
  dblp: '#7c3aed',
};

/** Accent color for a paper card under the current color mode (undefined = no accent). */
export function accentColor(mode: ColorMode, paper: Paper, clusterAccent: string | undefined): string | undefined {
  switch (mode) {
    case 'year':
      return clusterAccent;
    case 'cluster':
      return clusterAccent ?? '#cbd5e1';
    case 'status':
      return statusInfo(paper.status ?? 'unread')?.color;
    case 'source':
      return paper.sources?.[0] ? SOURCE_COLORS[paper.sources[0]] : '#cbd5e1';
    case 'screening':
      return SCREENING_COLORS[paper.screening?.decision ?? 'pending'];
  }
}

/** Badge color: year colors in year mode, otherwise the accent so the whole card reads as one color. */
export function badgeColor(mode: ColorMode, paper: Paper, accent: string | undefined): string {
  return mode === 'year' || !accent ? getYearColor(paper.year) : accent;
}

/** Card scale from citations: 0.85 for none up to 1.35 for the most cited paper in the map. */
export function citationScale(citations: number | undefined, max: number): number {
  if (!max || !citations) return 0.85;
  return 0.85 + 0.5 * (Math.log10(1 + citations) / Math.log10(1 + max));
}
