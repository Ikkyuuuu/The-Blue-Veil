export type Card = {
  id: string;
  name: string;
  numeral: string;
  image: string;
  upright: string;
  reversed: string;
  keywords: string[];
};
const definitions: [string, string, string, string, string][] = [
  [
    'The Fool',
    '0',
    'A fresh start invites curiosity and a small, considered leap.',
    'Pause before acting; distinguish openness from avoidable risk.',
    'beginnings,curiosity,possibility',
  ],
  [
    'The Magician',
    'I',
    'Your existing skills and resources can turn an intention into action.',
    'Focus your energy and check whether promises are supported by action.',
    'agency,skill,intention',
  ],
  [
    'The High Priestess',
    'II',
    'Quiet observation and intuition may reveal what hurried thinking misses.',
    'Give yourself space to hear your own judgement beneath outside noise.',
    'intuition,stillness,mystery',
  ],
  [
    'The Empress',
    'III',
    'Care, creativity and patient attention support something that is growing.',
    'Notice where giving too much leaves your own needs unattended.',
    'care,creation,growth',
  ],
  [
    'The Emperor',
    'IV',
    'Clear boundaries and practical structure can create stability.',
    'Reconsider rigid rules or a need to control every outcome.',
    'structure,boundaries,stability',
  ],
  [
    'The Hierophant',
    'V',
    'Shared values, a trusted mentor or an established practice may help.',
    'Question inherited expectations and choose values that are truly yours.',
    'tradition,learning,values',
  ],
  [
    'The Lovers',
    'VI',
    'An honest choice can bring your actions closer to your values.',
    'Examine conflicting values or conversations that have been avoided.',
    'choice,connection,alignment',
  ],
  [
    'The Chariot',
    'VII',
    'A clear direction and steady commitment help competing forces move together.',
    'Slow down and choose a direction before pushing harder.',
    'direction,resolve,movement',
  ],
  [
    'Strength',
    'VIII',
    'Patience and compassionate courage can be more useful than force.',
    'Rest and self-kindness may restore confidence that pressure has worn down.',
    'courage,patience,compassion',
  ],
  [
    'The Hermit',
    'IX',
    'Time for reflection can help you discover your own answer.',
    'Notice whether solitude is nourishing you or becoming withdrawal.',
    'reflection,solitude,wisdom',
  ],
  [
    'Wheel of Fortune',
    'X',
    'Circumstances change; look for the part of this cycle you can respond to.',
    'A repeating pattern invites adaptation rather than a struggle for control.',
    'cycles,change,timing',
  ],
  [
    'Justice',
    'XI',
    'Look honestly at the facts, your responsibilities and the consequences of choices.',
    'Check assumptions and take responsibility where an imbalance can be repaired.',
    'fairness,truth,accountability',
  ],
  [
    'The Hanged Man',
    'XII',
    'A deliberate pause may offer a perspective that effort alone cannot.',
    'Consider whether waiting still serves you or postpones a necessary choice.',
    'perspective,pause,release',
  ],
  [
    'Death',
    'XIII',
    'An ending can make space for change; this symbol does not predict physical death.',
    'Gently identify what you are holding onto after its purpose has passed.',
    'transition,endings,renewal',
  ],
  [
    'Temperance',
    'XIV',
    'Small adjustments, moderation and patience can bring things into balance.',
    'Restore a sustainable rhythm where extremes have become exhausting.',
    'balance,patience,integration',
  ],
  [
    'The Devil',
    'XV',
    'Name a limiting attachment or habit so you can begin to choose more freely.',
    'Recognising a restrictive pattern can be the first step toward releasing it.',
    'attachment,awareness,freedom',
  ],
  [
    'The Tower',
    'XVI',
    'A challenged assumption can reveal what needs a more honest foundation.',
    'Explore the change you are avoiding without assuming disaster is inevitable.',
    'revelation,disruption,rebuilding',
  ],
  [
    'The Star',
    'XVII',
    'Hope can return through simple care and a direction that feels meaningful.',
    'Reconnect with small sources of support when confidence feels distant.',
    'hope,renewal,trust',
  ],
  [
    'The Moon',
    'XVIII',
    'Uncertainty asks for curiosity; feelings matter, but they are not proof.',
    'Seek clarity patiently and test fears against what you actually know.',
    'uncertainty,dreams,perception',
  ],
  [
    'The Sun',
    'XIX',
    'Clarity, openness and ordinary joy may show you what is working.',
    'Allow imperfect progress and modest joys instead of demanding constant certainty.',
    'clarity,joy,vitality',
  ],
  [
    'Judgement',
    'XX',
    'Reflection on past choices can help you answer a meaningful new calling.',
    'Self-criticism may be obscuring the lessons that would let you move forward.',
    'reflection,calling,awakening',
  ],
  [
    'The World',
    'XXI',
    'A cycle is ready to be acknowledged, integrated or brought to completion.',
    'Identify one unfinished step before reaching for the next beginning.',
    'completion,integration,wholeness',
  ],
];
export const CARDS: Card[] = definitions.map(([name, numeral, upright, reversed, keywords]) => ({
  id: name.toLowerCase().replaceAll(' ', '-'),
  name,
  numeral,
  upright,
  reversed,
  keywords: keywords.split(','),
  image: `/assets/deck/${name.toLowerCase().replaceAll(' ', '-')}.png`,
}));
export const CARD_MAP = new Map(CARDS.map((card) => [card.id, card]));
export const DECK_VERSION = 'pixel-major-arcana-v1';
export const POSITIONS = ['The situation', 'The hidden influence', 'The path ahead'] as const;
export type DrawnCard = { id: string; reversed: boolean };
export type Interpretation = {
  cards: { cardId: string; interpretation: string }[];
  synthesis: string;
  reflection: string;
};
export type ReadingView = {
  id: string;
  question: string;
  status: 'drawing' | 'queued' | 'working' | 'complete' | 'failed' | 'canceled';
  cards: DrawnCard[];
  answer?: Interpretation;
  createdAt: number;
  expiresAt: number;
  message?: string;
};
export type SessionView = {
  csrf: string;
  remaining: number;
  resetsAt: number;
  activeReading: string | null;
  latestReading: string | null;
  mode: 'local' | 'bedrock';
  deckSize: number;
};
