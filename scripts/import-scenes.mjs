import { access, mkdir, rename, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) throw new Error('Usage: npm run assets:scenes -- "path to Tarot_Game_Loops"');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(root, 'public/assets/scenes');
if (resolve(source) === destination) throw new Error('Use a separate source directory.');
const clips = [
  ['tent_idle_loop.mp4', 'exterior'],
  ['tent_entrance_loop.mp4', 'entrance'],
  ['hooded_idle_loop.mp4', 'interior'],
  ['orb_reading_loop.mp4', 'reading'],
];
for (const [input] of clips) await access(resolve(source, input));
await mkdir(destination, { recursive: true });

function ffmpeg(args) {
  const result = spawnSync(
    process.env.FFMPEG_PATH || 'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-y', ...args],
    {
      stdio: 'inherit',
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Scene import failed.');
}

// Preserve the original loop masters' video pixels, dimensions and timestamps.
// Remux only: no resampling, sharpening, palette changes or extra compression.
// The pixel effect is applied live by the game, after video decoding.
for (const [input, name] of clips) {
  const temporary = resolve(destination, `${name}-master.encoding.mp4`);
  try {
    ffmpeg([
      '-i',
      resolve(source, input),
      '-map',
      '0:v:0',
      '-c:v',
      'copy',
      '-an',
      '-movflags',
      '+faststart',
      '-map_metadata',
      '-1',
      temporary,
    ]);
    await rename(temporary, resolve(destination, `${name}-master.mp4`));
    console.info(`${name}-master.mp4: imported without re-encoding`);
  } finally {
    await rm(temporary, { force: true });
  }
}
