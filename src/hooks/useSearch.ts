import { useCallback, useRef, useState } from 'react';
import type { SearchRequest, SearchResponse, VagueSearchRequest, VagueSearchResponse } from '../../shared/types';
import { apiPost } from '../api/client';

export type RequestState<Req, Res> =
  | { status: 'idle' }
  | { status: 'loading'; startedAt: number; request: Req }
  | { status: 'done'; request: Req; response: Res }
  | { status: 'error'; request: Req; message: string };

/** POST to `path`, keeping only the latest request's outcome. */
export function useApiRequest<Req, Res>(path: string) {
  const [state, setState] = useState<RequestState<Req, Res>>({ status: 'idle' });
  const seq = useRef(0);

  const run = useCallback(
    async (request: Req): Promise<Res | null> => {
      const id = ++seq.current;
      setState({ status: 'loading', startedAt: Date.now(), request });
      try {
        const response = await apiPost<Res>(path, request);
        // Ignore responses of requests that were superseded by a newer one.
        if (id !== seq.current) return null;
        setState({ status: 'done', request, response });
        return response;
      } catch (err) {
        if (id === seq.current) setState({ status: 'error', request, message: (err as Error).message });
        return null;
      }
    },
    [path],
  );

  const reset = useCallback(() => {
    seq.current++;
    setState({ status: 'idle' });
  }, []);

  return { state, run, reset };
}

export type SearchState = RequestState<SearchRequest, SearchResponse>;
export type VagueState = RequestState<VagueSearchRequest, VagueSearchResponse>;

export function useSearch() {
  return useApiRequest<SearchRequest, SearchResponse>('/api/search');
}

export function useVagueSearch() {
  return useApiRequest<VagueSearchRequest, VagueSearchResponse>('/api/vague-search');
}
