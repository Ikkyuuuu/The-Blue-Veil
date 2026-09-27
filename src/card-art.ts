import type { Card } from '../shared/cards';
import frames from './card-frames.json';

type Frame = { size: number[]; bounds: number[]; outline: number[][] };
const geometry: Record<string, Frame> = frames;
const clips = new Map<string, string>();

// Keep the source art intact. Only the measured exterior is clipped; dark areas
// enclosed by the decorative frame (including the title) are never color-keyed.
// All three uses — table, focused reading and gallery — share this same viewport.
export function createCardArt(card: Card, reversed: boolean, alt: string, lazy = false) {
  const {
    size: [width, height],
    bounds: [left, top, right, bottom],
    outline,
  } = geometry[card.id];
  const frame = document.createElement('span');
  frame.className = 'card-art';
  frame.classList.toggle('reversed', reversed);
  frame.dataset.card = card.id;
  const image = document.createElement('img');
  image.loading = lazy ? 'lazy' : 'eager';
  image.decoding = 'async';
  image.src = card.image;
  image.alt = alt;
  image.draggable = false;
  image.classList.toggle('reversed', reversed);
  const frameWidth = right - left,
    frameHeight = bottom - top;
  image.style.width = `${(100 * width) / frameWidth}%`;
  image.style.height = `${(100 * height) / frameHeight}%`;
  image.style.left = `${(-100 * left) / frameWidth}%`;
  image.style.top = `${(-100 * top) / frameHeight}%`;
  if (!clips.has(card.id)) {
    clips.set(
      card.id,
      `polygon(${outline
        .map(([x, y]) => `${((100 * x) / width).toFixed(4)}% ${((100 * y) / height).toFixed(4)}%`)
        .join(',')})`,
    );
  }
  image.style.clipPath = clips.get(card.id)!;
  frame.append(image);
  return frame;
}
