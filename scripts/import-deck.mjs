import { cp, mkdir, readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const source = process.argv[2];
if (!source) throw new Error('Usage: npm run assets:import -- "path to Pixel Tarot Deck"');
const root = resolve(source);
let directory;
for (const candidate of [
  root,
  join(root, 'Tarot Rework', 'Major Arcana'),
  join(root, 'Major Arcana'),
]) {
  try {
    if ((await readdir(candidate)).includes('The Fool')) {
      directory = candidate;
      break;
    }
  } catch {}
}
if (!directory) throw new Error('Could not find the reworked Major Arcana folder.');
const target = resolve('public/assets/deck');
await mkdir(target, { recursive: true });
const names = [
  'The Fool',
  'The Magician',
  'The High Priestess',
  'The Empress',
  'The Emperor',
  'The Hierophant',
  'The Lovers',
  'The Chariot',
  'Strength',
  'The Hermit',
  'Wheel of Fortune',
  'Justice',
  'The Hanged Man',
  'Death',
  'Temperance',
  'The Devil',
  'The Tower',
  'The Star',
  'The Moon',
  'The Sun',
  'Judgement',
  'The World',
  'Back',
];
const backOnly = process.argv.includes('--back-only');
for (const name of backOnly ? ['Back'] : names) {
  const dir = join(directory, name);
  const files = (await readdir(dir)).filter((x) => x.endsWith('.png'));
  if (files.length !== 1) throw new Error(`Expected exactly one PNG for ${name}.`);
  const file = join(dir, files[0]);
  const bytes = await readFile(file);
  if (bytes.readUInt32BE(16) !== 128 || bytes.readUInt32BE(20) !== 180)
    throw new Error(`Unexpected dimensions for ${name}; verify the pack version.`);
  await cp(file, join(target, `${name.toLowerCase().replaceAll(' ', '-')}.png`));
}
console.info(
  backOnly
    ? 'Imported the unchanged card back. Paid artwork remains ignored by Git.'
    : 'Imported 22 legacy Major Arcana cards and the back unchanged. The active deck uses generated faces. Paid artwork remains ignored by Git.',
);
