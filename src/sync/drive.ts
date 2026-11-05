// Project files in the user's Google Drive, in a "ResearchMindmap" folder (DESIGN 16.1),
// and the sharing permissions on them (16.5). Plain REST calls with the user's access
// token; `fetch` is injectable for tests. With the `drive.file` scope the app only sees
// files it created or the user picked.

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME = 'ResearchMindmap';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

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
  /** The project's ID, from the file's app properties. */
  id: string;
  /** The project's `updatedAt` when it was uploaded. */
  updatedAt: string;
  /** False for a file someone else shared with us. */
  ownedByMe: boolean;
  /** False when we may only read it. */
  canEdit: boolean;
}

export type ShareRole = 'reader' | 'writer';

export interface Person {
  /** Drive's permission ID. */
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'organizer' | 'fileOrganizer' | 'writer' | 'commenter' | 'reader';
}

export interface Remote {
  list(): Promise<RemoteFile[]>;
  read(fileId: string): Promise<string>;
  /** Create the project's file, or replace the one at `fileId`. Returns the file's ID. */
  write(id: string, text: string, updatedAt: string, fileId: string | undefined, name: string): Promise<string>;
  remove(fileId: string): Promise<void>;
  people(fileId: string): Promise<Person[]>;
  share(fileId: string, email: string, role: ShareRole): Promise<void>;
  unshare(fileId: string, permissionId: string): Promise<void>;
}

interface DriveFile {
  id: string;
  appProperties?: Record<string, string>;
  ownedByMe?: boolean;
  capabilities?: { canEdit?: boolean };
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

  const json = async <T>(url: string, init?: RequestInit) => (await call(url, init)).json() as Promise<T>;
  const jsonBody = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  function multipart(metadata: object, text: string): { body: string; contentType: string } {
    const boundary = `rmm${Math.random().toString(36).slice(2)}`;
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
    return { body, contentType: `multipart/related; boundary=${boundary}` };
  }

  // Found or created once per client; two devices creating one at the same time only
  // split new files between two folders, and the list does not care which folder.
  let folderId: Promise<string> | null = null;
  const ensureFolder = () =>
    (folderId ??= (async () => {
      const params = new URLSearchParams({
        q: `mimeType = '${FOLDER_MIME}' and appProperties has { key='rmmFolder' and value='1' } and 'me' in owners and trashed = false`,
        fields: 'files(id)',
        pageSize: '1',
      });
      const found = await json<{ files?: Array<{ id: string }> }>(`${API}/files?${params}`);
      if (found.files?.[0]) return found.files[0].id;
      const created = await json<{ id: string }>(
        `${API}/files?fields=id`,
        jsonBody('POST', { name: FOLDER_NAME, mimeType: FOLDER_MIME, appProperties: { rmmFolder: '1' } }),
      );
      return created.id;
    })().catch((err) => {
      folderId = null;
      throw err;
    }));

  return {
    async list() {
      const files = new Map<string, RemoteFile>();
      let pageToken = '';
      do {
        const params = new URLSearchParams({
          q: `appProperties has { key='rmmProject' and value='1' } and trashed = false`,
          fields: 'nextPageToken, files(id, appProperties, ownedByMe, capabilities(canEdit))',
          pageSize: '200',
        });
        if (pageToken) params.set('pageToken', pageToken);
        const page = await json<{ files?: DriveFile[]; nextPageToken?: string }>(`${API}/files?${params}`);
        for (const f of page.files ?? []) {
          const id = f.appProperties?.projectId;
          const updatedAt = f.appProperties?.updatedAt;
          if (!id || !updatedAt) continue;
          // Two files for one project (two devices creating it at once): the newer one counts.
          const seen = files.get(id);
          if (!seen || updatedAt > seen.updatedAt) {
            files.set(id, { fileId: f.id, id, updatedAt, ownedByMe: f.ownedByMe ?? true, canEdit: f.capabilities?.canEdit ?? true });
          }
        }
        pageToken = page.nextPageToken ?? '';
      } while (pageToken);
      return [...files.values()];
    },

    async read(fileId) {
      return (await call(`${API}/files/${encodeURIComponent(fileId)}?alt=media`)).text();
    },

    async write(id, text, updatedAt, fileId, name) {
      const appProperties = { rmmProject: '1', projectId: id, updatedAt };
      const metadata = fileId ? { name, appProperties } : { name, parents: [await ensureFolder()], appProperties };
      const { body, contentType } = multipart(metadata, text);
      const url = fileId
        ? `${UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id`
        : `${UPLOAD}/files?uploadType=multipart&fields=id`;
      const res = await call(url, { method: fileId ? 'PATCH' : 'POST', headers: { 'Content-Type': contentType }, body });
      return ((await res.json()) as { id: string }).id;
    },

    async remove(fileId) {
      await call(`${API}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
    },

    async people(fileId) {
      const params = new URLSearchParams({ fields: 'permissions(id, emailAddress, displayName, role, type)' });
      const res = await json<{ permissions?: Array<{ id: string; emailAddress?: string; displayName?: string; role: Person['role']; type?: string }> }>(
        `${API}/files/${encodeURIComponent(fileId)}/permissions?${params}`,
      );
      // Link sharing and domains have no address; only people are listed.
      return (res.permissions ?? [])
        .filter((p) => p.type === 'user' && p.emailAddress)
        .map((p) => ({ id: p.id, email: p.emailAddress!, name: p.displayName ?? p.emailAddress!, role: p.role }));
    },

    async share(fileId, email, role) {
      await call(
        `${API}/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=true`,
        jsonBody('POST', { type: 'user', role, emailAddress: email }),
      );
    },

    async unshare(fileId, permissionId) {
      await call(`${API}/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}`, { method: 'DELETE' });
    },
  };
}
