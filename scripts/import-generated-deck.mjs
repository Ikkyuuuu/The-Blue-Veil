import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { CARDS, DECK_VERSION } from '../shared/cards.ts';

const run = promisify(execFile);
const frames = JSON.parse(
  await readFile(new URL('../src/card-frames.json', import.meta.url), 'utf8'),
);
const sourceRoot = resolve(process.argv[2] ?? 'artifacts');
const selections = {
  major: 'major-arcana-generated-2026-09-27-v1',
  wands: 'wands-generated-2026-09-27-v2',
  cups: 'cups-generated-2026-09-27-v2',
  swords: 'swords-generated-2026-09-27-v2',
  pentacles: 'pentacles-generated-2026-09-27-v1',
};
const selected = new Map();
for (const [group, folder] of Object.entries(selections)) {
  const manifest = JSON.parse(await readFile(join(sourceRoot, folder, 'manifest.json'), 'utf8'));
  for (const item of manifest.cards) {
    const id = item.title.toLowerCase().replaceAll(' ', '-');
    if (selected.has(id) || basename(item.filename) !== item.filename)
      throw new Error(`Invalid or duplicate source card: ${id}`);
    selected.set(id, { ...item, group, folder });
  }
}
if (selected.size !== CARDS.length || CARDS.length !== 78)
  throw new Error('The selected source deck must contain exactly 78 cards.');

// Validate every source before writing any runtime asset.
for (const card of CARDS) {
  const item = selected.get(card.id);
  if (!item || item.group !== card.group) throw new Error(`Missing selected card: ${card.id}`);
  if (frames[card.id]?.sourceSha256 !== item.sha256)
    throw new Error(`The display mask needs review for the selected source: ${card.id}`);
  const bytes = await readFile(join(sourceRoot, item.folder, item.filename));
  if (createHash('sha256').update(bytes).digest('hex') !== item.sha256)
    throw new Error(`Source differs from approved manifest: ${card.id}`);
}

const output = resolve('public/assets/deck', DECK_VERSION);
await mkdir(output, { recursive: true });
const imported = [];
for (const card of CARDS) {
  const item = selected.get(card.id);
  const target = join(output, `${card.id}.webp`);
  await run(
    process.env.FFMPEG_PATH ?? 'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      join(sourceRoot, item.folder, item.filename),
      '-c:v',
      'libwebp',
      '-lossless',
      '1',
      '-compression_level',
      '6',
      '-pix_fmt',
      'bgra',
      '-y',
      target,
    ],
    { windowsHide: true },
  );
  const bytes = await readFile(target);
  imported.push({
    id: card.id,
    source: `${item.folder}/${item.filename}`,
    sourceSha256: item.sha256,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  });
  console.info(`${imported.length}/78 ${card.name}`);
}
await writeFile(
  join(output, 'manifest.json'),
  `${JSON.stringify({ version: DECK_VERSION, encoding: 'lossless WebP, original dimensions', cards: imported }, null, 2)}\n`,
);
console.info('Imported the selected 78-card deck. Source PNGs remain unchanged.');
