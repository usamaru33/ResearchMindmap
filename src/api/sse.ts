export interface StreamHandlers {
  onDelta: (text: string) => void;
  onDone?: (data: { text: string; [k: string]: unknown }) => void;
  onError?: (data: { code: string; message: string }) => void;
}

/** POST JSON and consume a Server-Sent Events response (delta / done / error). */
export async function streamPost(path: string, body: unknown, handlers: StreamHandlers, signal?: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    handlers.onError?.({ code: 'network', message: 'API サーバーに接続できません' });
    return;
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    let message = res.statusText;
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message;
    } catch {
      // keep statusText
    }
    handlers.onError?.({ code: 'http', message });
    return;
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let sep: number;
    while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(buffer[sep] === '\r' ? sep + 4 : sep + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (!data.length) continue;
      const payload = JSON.parse(data.join('\n'));
      if (event === 'delta') handlers.onDelta(payload.text);
      else if (event === 'done') handlers.onDone?.(payload);
      else if (event === 'error') handlers.onError?.(payload);
    }
  }
}
