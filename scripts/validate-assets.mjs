import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { CARDS, DECK_VERSION } from '../shared/cards.ts';
if (CARDS.length !== 78 || new Set(CARDS.map((card) => card.id)).size !== 78)
  throw new Error('Expected the selected 78-card catalog with unique IDs.');
for (const group of ['major', 'wands', 'cups', 'swords', 'pentacles']) {
  if (CARDS.filter((card) => card.group === group).length !== (group === 'major' ? 22 : 14))
    throw new Error(`Incomplete ${group} group.`);
}
const frames = JSON.parse(
  await readFile(new URL('../src/card-frames.json', import.meta.url), 'utf8'),
);
const manifest = JSON.parse(
  await readFile(`public/assets/deck/${DECK_VERSION}/manifest.json`, 'utf8'),
);
for (const card of CARDS) {
  await access(`public${card.image}`);
  const frame = frames[card.id];
  if (
    !frame ||
    frame.sourceSha256 !== manifest.cards.find((item) => item.id === card.id)?.sourceSha256
  )
    throw new Error(`Card display mask does not match the imported artwork: ${card.id}`);
  const [width, height] = frame.size;
  const [left, top, right, bottom] = frame.bounds;
  if (
    !(
      left >= 0 &&
      top >= 0 &&
      right <= width &&
      bottom <= height &&
      right > left &&
      bottom > top
    ) ||
    frame.outline.length < 4 ||
    frame.outline.some(
      ([x, y]) =>
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < left ||
        x >= right ||
        y < top ||
        y >= bottom,
    )
  )
    throw new Error(`Invalid card display contour: ${card.id}`);
}
await access('public/assets/deck/back.png');
for (const name of [
  'exterior-master.mp4',
  'entrance-master.mp4',
  'interior-master.mp4',
  'reading-master.mp4',
  'exterior.jpg',
  'interior.jpg',
  'interior-unlit.png',
])
  await access(`public/assets/scenes/${name}`);
const music = JSON.parse(await readFile('public/assets/music/manifest.json', 'utf8'));
const song = await readFile(`public/assets/music/${music.file}`);
if (song.length !== music.bytes || createHash('sha256').update(song).digest('hex') !== music.sha256)
  throw new Error('Background music differs from the original source recorded in its manifest.');
await access('public/licenses/a-dragons-lullaby.txt');
await access('public/licenses/CC-BY-4.0.txt');
console.info(
  `${CARDS.length} card faces and matching display masks, card back, required scenes and verified music with license notices are available.`,
);
