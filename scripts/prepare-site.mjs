import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { GAME_ASSETS } from '../src/assets.ts';

// Stage an explicit runtime allowlist, never the entire public/deck directory.
// Private manifests, previous decks and source galleries must not reach hosting.
const files = new Set([
  'index.html',
  ...GAME_ASSETS.map((path) => path.slice(1)),
  'assets/fonts/OFL.txt',
]);
const html = await readFile('dist/index.html', 'utf8');
for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g))
  files.add(match[1].slice(1));
for (const file of await readdir('dist/licenses', { withFileTypes: true })) {
  if (file.isFile() && /\.txt$/i.test(file.name)) files.add(`licenses/${file.name}`);
}
const root = resolve('.private/deploy/site');
await mkdir(root, { recursive: true });
// Refuse stale extras rather than deleting an operator's files or publishing them.
async function checkExisting(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = resolve(folder, entry.name);
    if (entry.isDirectory()) await checkExisting(path);
    else if (
      !files.has(
        path
          .slice(root.length + 1)
          .split(sep)
          .join('/'),
      )
    )
      throw new Error('Unexpected old file in staging directory. Review the private site folder.');
  }
}
await checkExisting(root);
let bytes = 0;
for (const file of files) {
  if (!/^[a-zA-Z0-9_./-]+$/.test(file) || file.split('/').includes('..'))
    throw new Error('Unsafe runtime asset path');
  const target = resolve(root, file);
  if (!target.startsWith(root + sep)) throw new Error('Asset escapes staging directory');
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve('dist', file), target);
  bytes += (await stat(target)).size;
}
await writeFile(
  '.private/deploy/site-manifest.local.json',
  JSON.stringify(
    {
      files: [...files].sort(),
      bytes,
    },
    null,
    2,
  ) + '\n',
);
console.info(
  `Prepared ${files.size} runtime files (${(bytes / 1024 / 1024).toFixed(1)} MiB). No uploads performed.`,
);
