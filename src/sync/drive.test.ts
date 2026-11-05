import { describe, expect, it } from 'vitest';
import { DriveError, createDrive } from './drive';

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(responses: Array<Response | Error>) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const header = (call: Call, name: string) => (call.init.headers as Record<string, string>)[name];

describe('Drive appData client', () => {
  it('lists project files from the appData folder with the access token', async () => {
    const { fn, calls } = fakeFetch([
      json({
        files: [
          { id: 'f1', name: 'rmm-project-p1.json', appProperties: { updatedAt: '2026-11-01T00:00:00.000Z' } },
          { id: 'f2', name: 'rmm-project-p2.json', appProperties: { updatedAt: '2026-11-02T00:00:00.000Z' } },
          { id: 'f3', name: 'rmm-project-p3.json' }, // no update time: not ours to read
          { id: 'f4', name: 'other.json', appProperties: { updatedAt: 'x' } },
        ],
      }),
    ]);
    const files = await createDrive(() => 'tok', fn).list();
    expect(files).toEqual([
      { fileId: 'f1', id: 'p1', updatedAt: '2026-11-01T00:00:00.000Z' },
      { fileId: 'f2', id: 'p2', updatedAt: '2026-11-02T00:00:00.000Z' },
    ]);
    expect(calls[0].url).toContain('spaces=appDataFolder');
    expect(header(calls[0], 'Authorization')).toBe('Bearer tok');
  });

  it('follows pages and keeps the newer of two files for one project', async () => {
    const { fn, calls } = fakeFetch([
      json({ files: [{ id: 'old', name: 'rmm-project-p1.json', appProperties: { updatedAt: 'A' } }], nextPageToken: 'next' }),
      json({ files: [{ id: 'new', name: 'rmm-project-p1.json', appProperties: { updatedAt: 'B' } }] }),
    ]);
    const files = await createDrive(() => 't', fn).list();
    expect(files).toEqual([{ fileId: 'new', id: 'p1', updatedAt: 'B' }]);
    expect(calls[1].url).toContain('pageToken=next');
  });

  it('reads a file as text', async () => {
    const { fn, calls } = fakeFetch([new Response('{"id":"p1"}')]);
    expect(await createDrive(() => 't', fn).read('f1')).toBe('{"id":"p1"}');
    expect(calls[0].url).toContain('/files/f1?alt=media');
  });

  it('creates a file in the appData folder with the update time as a property', async () => {
    const { fn, calls } = fakeFetch([json({ id: 'new-file' })]);
    const id = await createDrive(() => 't', fn).write('p1', '{"x":1}', 'U1');
    expect(id).toBe('new-file');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].url).toContain('/upload/drive/v3/files?uploadType=multipart');
    expect(header(calls[0], 'Content-Type')).toMatch(/^multipart\/related; boundary=/);
    const body = String(calls[0].init.body);
    expect(body).toContain('"name":"rmm-project-p1.json"');
    expect(body).toContain('"parents":["appDataFolder"]');
    expect(body).toContain('"appProperties":{"updatedAt":"U1"}');
    expect(body).toContain('{"x":1}');
  });

  it('replaces an existing file without moving it', async () => {
    const { fn, calls } = fakeFetch([json({ id: 'f1' })]);
    await createDrive(() => 't', fn).write('p1', '{}', 'U2', 'f1');
    expect(calls[0].init.method).toBe('PATCH');
    expect(calls[0].url).toContain('/files/f1?uploadType=multipart');
    expect(String(calls[0].init.body)).not.toContain('parents');
  });

  it('deletes a file', async () => {
    const { fn, calls } = fakeFetch([new Response(null, { status: 204 })]);
    await createDrive(() => 't', fn).remove('f1');
    expect(calls[0].init.method).toBe('DELETE');
  });

  it('sorts failures into sign-in, quota, network and other', async () => {
    const kind = async (res: Response | Error) => {
      const { fn } = fakeFetch([res]);
      const err = await createDrive(() => 't', fn).list().catch((e) => e);
      expect(err).toBeInstanceOf(DriveError);
      return (err as DriveError).kind;
    };
    expect(await kind(new Response('expired', { status: 401 }))).toBe('auth');
    expect(await kind(new Response('{"error":{"errors":[{"reason":"storageQuotaExceeded"}]}}', { status: 403 }))).toBe('quota');
    expect(await kind(new Response('Request had insufficient authentication scopes', { status: 403 }))).toBe('auth');
    expect(await kind(new TypeError('Failed to fetch'))).toBe('network');
    expect(await kind(new Response('boom', { status: 500 }))).toBe('http');
  });
});
