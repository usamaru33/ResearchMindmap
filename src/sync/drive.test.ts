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
const query = (call: Call) => new URL(call.url).searchParams.get('q');
const header = (call: Call, name: string) => (call.init.headers as Record<string, string>)[name];
const file = (id: string, projectId: string, updatedAt: string, extra: object = {}) => ({
  id,
  appProperties: { rmmProject: '1', projectId, updatedAt },
  ...extra,
});

describe('Drive client: project files', () => {
  it('lists the app\'s project files with the access token, and who owns them', async () => {
    const { fn, calls } = fakeFetch([
      json({
        files: [
          file('f1', 'p1', '2026-11-01T00:00:00.000Z'),
          file('f2', 'p2', '2026-11-02T00:00:00.000Z', { ownedByMe: false, capabilities: { canEdit: false } }),
          { id: 'f3', appProperties: { rmmProject: '1', projectId: 'p3' } }, // no update time: not ours to read
          { id: 'f4', appProperties: { rmmProject: '1', updatedAt: 'x' } }, // no project ID
        ],
      }),
    ]);
    const files = await createDrive(() => 'tok', fn).list();
    expect(files).toEqual([
      { fileId: 'f1', id: 'p1', updatedAt: '2026-11-01T00:00:00.000Z', ownedByMe: true, canEdit: true },
      { fileId: 'f2', id: 'p2', updatedAt: '2026-11-02T00:00:00.000Z', ownedByMe: false, canEdit: false },
    ]);
    expect(query(calls[0])).toContain("appProperties has { key='rmmProject' and value='1' }");
    expect(calls[0].url).not.toContain('appDataFolder');
    expect(header(calls[0], 'Authorization')).toBe('Bearer tok');
  });

  it('follows pages and keeps the newer of two files for one project', async () => {
    const { fn, calls } = fakeFetch([
      json({ files: [file('old', 'p1', 'A')], nextPageToken: 'next' }),
      json({ files: [file('new', 'p1', 'B')] }),
    ]);
    const files = await createDrive(() => 't', fn).list();
    expect(files).toMatchObject([{ fileId: 'new', id: 'p1', updatedAt: 'B' }]);
    expect(calls[1].url).toContain('pageToken=next');
  });

  it('reads a file as text', async () => {
    const { fn, calls } = fakeFetch([new Response('{"id":"p1"}')]);
    expect(await createDrive(() => 't', fn).read('f1')).toBe('{"id":"p1"}');
    expect(calls[0].url).toContain('/files/f1?alt=media');
  });

  it('creates a file in the ResearchMindmap folder, making the folder once', async () => {
    const { fn, calls } = fakeFetch([json({}), json({ id: 'folder' }), json({ id: 'file-1' }), json({ id: 'file-2' })]);
    const drive = createDrive(() => 't', fn);
    expect(await drive.write('p1', '{"x":1}', 'U1', undefined, 'Map.rmm.json')).toBe('file-1');
    expect(await drive.write('p2', '{}', 'U2', undefined, 'Other.rmm.json')).toBe('file-2');

    expect(query(calls[0])).toContain("appProperties has { key='rmmFolder' and value='1' }"); // looked for first
    expect(String(calls[1].init.body)).toContain('"name":"ResearchMindmap"');
    expect(calls).toHaveLength(4); // the folder was not looked up again
    expect(calls[2].init.method).toBe('POST');
    expect(calls[2].url).toContain('/upload/drive/v3/files?uploadType=multipart');
    expect(header(calls[2], 'Content-Type')).toMatch(/^multipart\/related; boundary=/);
    const body = String(calls[2].init.body);
    expect(body).toContain('"name":"Map.rmm.json"');
    expect(body).toContain('"parents":["folder"]');
    expect(body).toContain('"appProperties":{"rmmProject":"1","projectId":"p1","updatedAt":"U1"}');
    expect(body).toContain('{"x":1}');
  });

  it('reuses a folder it already made', async () => {
    const { fn, calls } = fakeFetch([json({ files: [{ id: 'existing' }] }), json({ id: 'f' })]);
    await createDrive(() => 't', fn).write('p1', '{}', 'U1', undefined, 'Map.rmm.json');
    expect(calls).toHaveLength(2);
    expect(String(calls[1].init.body)).toContain('"parents":["existing"]');
  });

  it('replaces an existing file, renaming it, without moving it or looking for the folder', async () => {
    const { fn, calls } = fakeFetch([json({ id: 'f1' })]);
    await createDrive(() => 't', fn).write('p1', '{}', 'U2', 'f1', 'Renamed.rmm.json');
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe('PATCH');
    expect(calls[0].url).toContain('/files/f1?uploadType=multipart');
    expect(String(calls[0].init.body)).toContain('"name":"Renamed.rmm.json"');
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

describe('Drive client: sharing', () => {
  it('lists the people a file is shared with, leaving out links and domains', async () => {
    const { fn, calls } = fakeFetch([
      json({
        permissions: [
          { id: 'a', type: 'user', emailAddress: 'me@example.com', displayName: 'Me', role: 'owner' },
          { id: 'b', type: 'user', emailAddress: 'you@example.com', role: 'writer' },
          { id: 'anyone', type: 'anyone', role: 'reader' },
        ],
      }),
    ]);
    expect(await createDrive(() => 't', fn).people('f1')).toEqual([
      { id: 'a', email: 'me@example.com', name: 'Me', role: 'owner' },
      { id: 'b', email: 'you@example.com', name: 'you@example.com', role: 'writer' },
    ]);
    expect(calls[0].url).toContain('/files/f1/permissions');
  });

  it('shares with a person by e-mail address, with the role asked for', async () => {
    const { fn, calls } = fakeFetch([json({ id: 'perm' })]);
    await createDrive(() => 't', fn).share('f1', 'you@example.com', 'reader');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].url).toContain('/files/f1/permissions');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ type: 'user', role: 'reader', emailAddress: 'you@example.com' });
    expect(header(calls[0], 'Content-Type')).toBe('application/json');
  });

  it('removes a permission', async () => {
    const { fn, calls } = fakeFetch([new Response(null, { status: 204 })]);
    await createDrive(() => 't', fn).unshare('f1', 'perm 1');
    expect(calls[0].init.method).toBe('DELETE');
    expect(calls[0].url).toContain('/files/f1/permissions/perm%201');
  });
});
