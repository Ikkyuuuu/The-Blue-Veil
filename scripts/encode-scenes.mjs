import { access, mkdir, rename, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) throw new Error('Usage: npm run assets:encode -- "path to Tarot_Game_Loops"');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(root, 'public/assets/scenes');
const clips = [
  ['tent_idle_loop.mp4', 'exterior.mp4'],
  ['tent_entrance_loop.mp4', 'entrance.mp4'],
  ['hooded_idle_loop.mp4', 'interior.mp4'],
  ['orb_reading_loop.mp4', 'reading.mp4'],
];
for (const [input] of clips) await access(resolve(source, input));
await mkdir(destination, { recursive: true });

// Upscale the supplied 720p loop masters, not the earlier compressed web exports.
// No frame-rate conversion or trimming: keep the existing loop joins and duration.
for (const [input, output] of clips) {
  const temporary = resolve(destination, `${output}.encoding.mp4`);
  try {
    const result = spawnSync(
      process.env.FFMPEG_PATH || 'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        resolve(source, input),
        '-map',
        '0:v:0',
        '-an',
        '-vf',
        'scale=2560:1440:flags=lanczos,setsar=1',
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '20',
        '-threads',
        '4',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-map_metadata',
        '-1',
        temporary,
      ],
      { stdio: 'inherit', windowsHide: true },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Encoding failed: ${input}`);
    await rename(temporary, resolve(destination, output));
    console.info(`${output}: 2560 × 1440 (upscaled from the supplied loop master)`);
  } finally {
    await rm(temporary, { force: true });
  }
}
