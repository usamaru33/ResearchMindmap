import { useCallback, useEffect, useRef, useState } from 'react';
import { streamPost } from '../api/sse';

export type StreamState =
  | { status: 'idle' }
  | { status: 'streaming'; text: string }
  | { status: 'done'; text: string; mode: 'llm' | 'fallback' }
  | { status: 'error'; text: string; message: string };

/** Run an SSE endpoint, accumulating its text; a new run (or unmount) cancels the previous one. */
export function useStream(path: string) {
  const [state, setState] = useState<StreamState>({ status: 'idle' });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const run = useCallback(
    async (body: unknown) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      let text = '';
      setState({ status: 'streaming', text });
      await streamPost(
        path,
        body,
        {
          onDelta: (t) => {
            text += t;
            setState({ status: 'streaming', text });
          },
          onDone: (d) => setState({ status: 'done', text: d.text ?? text, mode: d.mode === 'llm' ? 'llm' : 'fallback' }),
          onError: (e) => setState({ status: 'error', text, message: e.message }),
        },
        controller.signal,
      );
    },
    [path],
  );

  const reset = useCallback(() => {
    abort.current?.abort();
    setState({ status: 'idle' });
  }, []);

  return { state, run, reset };
}
