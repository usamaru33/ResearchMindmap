import { useEffect, useState } from 'react';
import type { HealthResponse } from '../../shared/types';
import { getHealth } from '../api/client';

export type ApiHealthState =
  | { status: 'loading' }
  | { status: 'ok'; health: HealthResponse }
  | { status: 'error'; message: string };

export function useApiHealth(): ApiHealthState {
  const [state, setState] = useState<ApiHealthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getHealth()
      .then((health) => {
        if (!cancelled) setState({ status: 'ok', health });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ status: 'error', message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
