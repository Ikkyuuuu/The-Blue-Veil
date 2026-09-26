import { access } from 'node:fs/promises';
import { CARDS } from '../shared/cards.ts';
if (CARDS.length !== 22) throw new Error('Expected the approved 22-card Major Arcana catalog.');
for (const card of CARDS) await access(`public${card.image}`);
await access('public/assets/deck/back.png');
for (const name of [
  'exterior.mp4',
  'entrance.mp4',
  'interior.mp4',
  'reading.mp4',
  'exterior.jpg',
  'interior-unlit.png',
])
  await access(`public/assets/scenes/${name}`);
console.info(`${CARDS.length} card faces, card back and required scenes are available.`);
