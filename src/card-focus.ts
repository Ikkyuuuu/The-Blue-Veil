import { CARD_MAP, type DrawnCard } from '../shared/cards';

type Aura = { tone: string; primary: string; secondary: string };

// RGB channels for original light effects; the purchased card images stay unchanged.
export const CARD_AURAS: Record<string, Aura> = {
  'the-fool': { tone: 'possibility', primary: '151 231 187', secondary: '245 221 143' },
  'the-magician': { tone: 'intention', primary: '190 118 246', secondary: '245 187 91' },
  'the-high-priestess': { tone: 'intuition', primary: '115 129 238', secondary: '195 215 250' },
  'the-empress': { tone: 'growth', primary: '109 186 128', secondary: '230 156 183' },
  'the-emperor': { tone: 'stability', primary: '194 90 72', secondary: '228 175 91' },
  'the-hierophant': { tone: 'wisdom', primary: '215 192 131', secondary: '167 142 216' },
  'the-lovers': { tone: 'connection', primary: '230 134 177', secondary: '246 192 153' },
  'the-chariot': { tone: 'resolve', primary: '94 157 240', secondary: '208 226 250' },
  strength: { tone: 'courage', primary: '237 169 84', secondary: '221 128 97' },
  'the-hermit': { tone: 'reflection', primary: '143 173 209', secondary: '233 197 132' },
  'wheel-of-fortune': { tone: 'change', primary: '214 167 91', secondary: '158 111 224' },
  justice: { tone: 'truth', primary: '180 200 222', secondary: '137 150 224' },
  'the-hanged-man': { tone: 'surrender', primary: '92 189 184', secondary: '176 161 231' },
  death: { tone: 'transformation', primary: '149 99 203', secondary: '86 183 159' },
  temperance: { tone: 'harmony', primary: '131 210 202', secondary: '235 208 151' },
  'the-devil': { tone: 'attachment', primary: '183 58 89', secondary: '190 105 63' },
  'the-tower': { tone: 'revelation', primary: '162 143 234', secondary: '240 156 86' },
  'the-star': { tone: 'hope', primary: '121 213 243', secondary: '189 167 239' },
  'the-moon': { tone: 'mystery', primary: '101 112 208', secondary: '194 208 237' },
  'the-sun': { tone: 'joy', primary: '255 211 100', secondary: '242 153 65' },
  judgement: { tone: 'awakening', primary: '230 213 171', secondary: '175 199 240' },
  'the-world': { tone: 'wholeness', primary: '103 207 176', secondary: '228 201 125' },
};

export function createCardFocus(element: HTMLElement) {
  element.innerHTML =
    '<div class="focus-veil"></div><div class="focus-center"><div class="focus-art"></div></div>';
  const art = element.querySelector<HTMLElement>('.focus-art')!;
  let current = '';
  return {
    show(drawn?: DrawnCard) {
      const card = drawn && CARD_MAP.get(drawn.id);
      document.body.classList.toggle('card-focused', Boolean(card));
      element.classList.toggle('visible', Boolean(card));
      if (!card || !drawn) {
        current = '';
        return;
      }
      const key = `${card.id}:${drawn.reversed}`;
      if (current === key) return;
      current = key;
      const aura = CARD_AURAS[card.id] ?? CARD_AURAS['the-high-priestess'];
      element.dataset.card = card.id;
      element.dataset.tone = aura.tone;
      element.style.setProperty('--aura-primary', aura.primary);
      element.style.setProperty('--aura-secondary', aura.secondary);
      const image = document.createElement('img');
      image.src = card.image;
      image.alt = ''; // The dialogue already announces the name and orientation.
      image.draggable = false;
      image.classList.toggle('reversed', drawn.reversed);
      const reveal = document.createElement('div');
      reveal.className = 'focus-reveal';
      reveal.append(image);
      art.replaceChildren(reveal);
    },
    update(paused: boolean) {
      element.classList.toggle('paused', paused);
    },
  };
}
