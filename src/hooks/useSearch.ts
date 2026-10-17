import { useCallback, useRef, useState } from 'react';
import type { SearchRequest, SearchResponse } from '../../shared/types';
import { apiPost } from '../api/client';

export type SearchState =
  | { status: 'idle' }
  | { status: 'loading'; startedAt: number; request: SearchRequest }
  | { status: 'done'; request: SearchRequest; response: SearchResponse }
  | { status: 'error'; request: SearchRequest; message: string };

export function useSearch() {
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const seq = useRef(0);

  const run = useCallback(async (request: SearchRequest) => {
    const id = ++seq.current;
    setState({ status: 'loading', startedAt: Date.now(), request });
    try {
      const response = await apiPost<SearchResponse>('/api/search', request);
      // Ignore responses of searches that were superseded by a newer one.
      if (id === seq.current) setState({ status: 'done', request, response });
    } catch (err) {
      if (id === seq.current) setState({ status: 'error', request, message: (err as Error).message });
    }
  }, []);

  const reset = useCallback(() => {
    seq.current++;
    setState({ status: 'idle' });
  }, []);

  return { state, run, reset };
}
