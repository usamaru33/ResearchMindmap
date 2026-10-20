// Build the Windows desktop app (DESIGN 15.3) as a Node.js single executable:
// bundle server/desktop.ts, embed the built app (dist/) as SEA assets, and inject
// them into a copy of this Node binary. Run `npm run build` first.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const work = join(root, 'build');
const out = join(root, 'release');
const exe = join(out, 'ResearchMindmap.exe');

if (process.platform !== 'win32') throw new Error('build:exe makes a Windows executable: run it on Windows.');
if (!existsSync(join(root, 'dist', 'index.html'))) throw new Error('dist/ is missing: run `npm run build` first.');

rmSync(work, { recursive: true, force: true });
rmSync(out, { recursive: true, force: true });
mkdirSync(work);
mkdirSync(out);

await build({
  entryPoints: [join(root, 'server', 'desktop.ts')],
  outfile: join(work, 'desktop.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: `node${process.versions.node.split('.')[0]}`,
  minify: false,
  legalComments: 'inline',
  logLevel: 'warning',
});

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const dist = join(root, 'dist');
const published = filesUnder(dist).map((path) => `/${relative(dist, path).split(sep).join('/')}`);
writeFileSync(join(work, 'manifest.json'), JSON.stringify(published));
const assets = {
  'manifest.json': join(work, 'manifest.json'),
  'env.example': join(root, '.env.example'),
  ...Object.fromEntries(published.map((p) => [`app${p}`, join(dist, ...p.slice(1).split('/'))])),
};
writeFileSync(
  join(work, 'sea-config.json'),
  JSON.stringify({ main: join(work, 'desktop.cjs'), output: join(work, 'sea-prep.blob'), disableExperimentalSEAWarning: true, assets }, null, 2),
);
execFileSync(process.execPath, ['--experimental-sea-config', join(work, 'sea-config.json')], { stdio: 'inherit' });

copyFileSync(process.execPath, exe);
// The Node binary's signature no longer matches once the app is injected: drop it.
const signtool = findSigntool();
if (signtool) execFileSync(signtool, ['remove', '/s', exe], { stdio: 'inherit' });
else if (process.env.CI) throw new Error('signtool.exe not found');
else console.warn('[build:exe] signtool.exe not found; the executable keeps a broken Node.js signature.');

execFileSync(
  process.execPath,
  [join(root, 'node_modules', 'postject', 'dist', 'cli.js'), exe, 'NODE_SEA_BLOB', join(work, 'sea-prep.blob'), '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'],
  { stdio: 'inherit' },
);

const sha256 = createHash('sha256').update(readFileSync(exe)).digest('hex');
writeFileSync(join(out, 'SHA256SUMS.txt'), `${sha256}  ResearchMindmap.exe\n`);
console.log(`[build:exe] ${relative(root, exe)} (Node.js ${process.version})\n[build:exe] sha256 ${sha256}`);

/** signtool.exe from the newest installed Windows SDK. */
function findSigntool() {
  const kits = join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin');
  if (!existsSync(kits)) return null;
  const versions = readdirSync(kits).filter((v) => /^10\./.test(v)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const v of versions) {
    const path = join(kits, v, 'x64', 'signtool.exe');
    if (existsSync(path)) return path;
  }
  return null;
}
