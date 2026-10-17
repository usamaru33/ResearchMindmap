import type { ApiError, HealthResponse } from '../../shared/types';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiClientError(0, 'network', 'API サーバーに接続できません（npm run dev:server で起動してください）');
  }
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = (body as ApiError | null)?.error;
    throw new ApiClientError(res.status, err?.code ?? 'http', err?.message ?? res.statusText);
  }
  return body as T;
}

export function apiPost<T>(path: string, payload: unknown, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, { ...init, method: 'POST', body: JSON.stringify(payload) });
}

export function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/api/health');
}
