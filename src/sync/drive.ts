// Google Drive's appData folder as a place for project files (DESIGN 16.1).
// Plain REST calls with the user's access token; `fetch` is injectable for tests.

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const NAME_PREFIX = 'rmm-project-';
const NAME = /^rmm-project-(.+)\.json$/;

export type DriveErrorKind = 'auth' | 'quota' | 'network' | 'http';

export class DriveError extends Error {
  readonly kind: DriveErrorKind;
  readonly status: number;
  constructor(kind: DriveErrorKind, status: number, message: string) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

export interface RemoteFile {
  /** Drive's file ID. */
  fileId: string;
  /** The project's ID, from the file name. */
  id: string;
  /** The project's `updatedAt` when it was uploaded. */
  updatedAt: string;
}

export interface Remote {
  list(): Promise<RemoteFile[]>;
  read(fileId: string): Promise<string>;
  /** Create the project's file, or replace the one at `fileId`. Returns the file's ID. */
  write(id: string, text: string, updatedAt: string, fileId?: string): Promise<string>;
  remove(fileId: string): Promise<void>;
}

interface DriveFile {
  id: string;
  name: string;
  appProperties?: Record<string, string>;
}

export function createDrive(getToken: () => string, fetchFn: typeof fetch = (...a) => fetch(...a)): Remote {
  async function call(url: string, init: RequestInit = {}): Promise<Response> {
    let res: Response;
    try {
      res = await fetchFn(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${getToken()}` } });
    } catch {
      throw new DriveError('network', 0, 'network');
    }
    if (res.ok) return res;
    const detail = await res.text().catch(() => '');
    if (res.status === 401) throw new DriveError('auth', 401, detail);
    if (res.status === 403 && /storageQuotaExceeded/.test(detail)) throw new DriveError('quota', 403, detail);
    // A 403 for a missing scope also means the user has to sign in again.
    if (res.status === 403 && /insufficient|scope/i.test(detail)) throw new DriveError('auth', 403, detail);
    throw new DriveError('http', res.status, detail.slice(0, 300));
  }

  function multipart(metadata: object, text: string): { body: string; contentType: string } {
    const boundary = `rmm${Math.random().toString(36).slice(2)}`;
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
    return { body, contentType: `multipart/related; boundary=${boundary}` };
  }

  return {
    async list() {
      const files = new Map<string, RemoteFile>();
      let pageToken = '';
      do {
        const params = new URLSearchParams({
          spaces: 'appDataFolder',
          q: `name contains '${NAME_PREFIX}' and trashed = false`,
          fields: 'nextPageToken, files(id, name, appProperties)',
          pageSize: '200',
        });
        if (pageToken) params.set('pageToken', pageToken);
        const page = (await (await call(`${API}/files?${params}`)).json()) as { files?: DriveFile[]; nextPageToken?: string };
        for (const f of page.files ?? []) {
          const id = NAME.exec(f.name)?.[1];
          const updatedAt = f.appProperties?.updatedAt;
          if (!id || !updatedAt) continue;
          // Two files for one project (two devices creating it at once): the newer one counts.
          const seen = files.get(id);
          if (!seen || updatedAt > seen.updatedAt) files.set(id, { fileId: f.id, id, updatedAt });
        }
        pageToken = page.nextPageToken ?? '';
      } while (pageToken);
      return [...files.values()];
    },

    async read(fileId) {
      return (await call(`${API}/files/${encodeURIComponent(fileId)}?alt=media`)).text();
    },

    async write(id, text, updatedAt, fileId) {
      const appProperties = { updatedAt };
      const { body, contentType } = multipart(
        fileId ? { appProperties } : { name: `${NAME_PREFIX}${id}.json`, parents: ['appDataFolder'], appProperties },
        text,
      );
      const url = fileId
        ? `${UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id`
        : `${UPLOAD}/files?uploadType=multipart&fields=id`;
      const res = await call(url, { method: fileId ? 'PATCH' : 'POST', headers: { 'Content-Type': contentType }, body });
      return ((await res.json()) as { id: string }).id;
    },

    async remove(fileId) {
      await call(`${API}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
    },
  };
}
