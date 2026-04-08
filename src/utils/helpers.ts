export function generateId(): string {
  return crypto.randomUUID();
}

export function getYearColor(year: number): string {
  if (year >= 2024) return '#8b5cf6';
  if (year >= 2023) return '#6366f1';
  if (year >= 2022) return '#3b82f6';
  if (year >= 2021) return '#06b6d4';
  if (year >= 2020) return '#10b981';
  if (year >= 2019) return '#84cc16';
  if (year >= 2018) return '#eab308';
  if (year >= 2017) return '#f97316';
  if (year >= 2016) return '#f43f5e';
  return '#6b7280';
}

export function getEdgeStyle(relationship: string): {
  stroke: string;
  strokeWidth: number;
  animated: boolean;
} {
  const styles: Record<string, { stroke: string; strokeWidth: number; animated: boolean }> = {
    'cites': { stroke: '#6366f1', strokeWidth: 2, animated: false },
    'builds upon': { stroke: '#6366f1', strokeWidth: 2, animated: false },
    'extends': { stroke: '#8b5cf6', strokeWidth: 2, animated: false },
    'contradicts': { stroke: '#ef4444', strokeWidth: 2, animated: true },
    'compares with': { stroke: '#f59e0b', strokeWidth: 1.5, animated: false },
    'inspired by': { stroke: '#10b981', strokeWidth: 1.5, animated: false },
    'uses method': { stroke: '#06b6d4', strokeWidth: 1.5, animated: false },
  };
  return styles[relationship] ?? { stroke: '#94a3b8', strokeWidth: 1.5, animated: false };
}

export function truncateAuthors(authors: string[], maxCount = 3): string {
  if (authors.length <= maxCount) {
    return authors.join(', ');
  }
  return authors.slice(0, maxCount).join(', ') + ' et al.';
}

export const RELATIONSHIP_OPTIONS = [
  'builds upon',
  'extends',
  'contradicts',
  'compares with',
  'inspired by',
  'uses method',
  'related to',
];
