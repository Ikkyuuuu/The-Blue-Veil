import './style.css';
import './ui.css';
import './loading.css';
import { assetUrl, loadGameAssets } from './assets';
import {
  CARDS,
  CARD_GROUPS,
  CARD_MAP,
  POSITIONS,
  type ReadingView,
  type SessionView,
} from '../shared/cards';
import { ApiError, Client } from './api';
import { Sound } from './audio';
import { createPixelScenes } from './pixel-scenes';
import { createCardMotion } from './card-motion';
import { createCardFocus } from './card-focus';
import { createCardArt } from './card-art';
import { prepareEntrance, waitForCurtainMatch } from './entrance';
import { createReadingOrb } from './reading-orb';

const loading = await loadGameAssets(document.querySelector<HTMLElement>('#app')!);

const speaker =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h5l5-5v16l-5-5H3zM17 8v8m4-11v14"/></svg>';
// GitHub Octicons mark-github-16; see /licenses/octicons-MIT.txt.
const github =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656"/></svg>';
const fullscreenPaths = {
  enter: 'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5',
  exit: 'M4 9h5V4m6 0v5h5M9 20v-5H4m16 0h-5v5',
};
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<main id="game" aria-label="The Blue Veil tarot game">
  <div class="world" aria-hidden="true">
    <div class="scene-frame exterior-scene"></div>
    <div class="scene-frame interior-scene"><img class="scene-image" src="${assetUrl('/assets/scenes/interior-unlit.png')}" alt=""><video id="interior-video" class="scene-image figure-video" muted loop playsinline preload="none" src="${assetUrl('/assets/scenes/interior-master.mp4?v=live-pixel-1')}"></video><video id="reading-video" class="scene-image figure-video reading-video" muted loop playsinline preload="none" src="${assetUrl('/assets/scenes/reading-master.mp4?v=live-pixel-1')}"></video><div class="orb-aura"></div><div class="scene-candle candle-left"><i></i><b></b></div><div class="scene-candle candle-right"><i></i><b></b></div><div class="scene-candle candle-short"><i></i><b></b></div></div>
    <div class="scene-frame entrance-scene"><video id="entrance-video" class="scene-image" muted playsinline preload="none" src="${assetUrl('/assets/scenes/entrance-master.mp4?v=live-pixel-1')}"></video></div>
    <div class="vignette"></div><div class="motes">${Array.from({ length: 9 }, (_, i) => `<i style="--n:${i}"></i>`).join('')}</div>
  </div>
  <div class="game-controls"><a id="github-link" class="icon-button" href="https://github.com/Ikkyuuuu/The-Blue-Veil" target="_blank" rel="noopener noreferrer" aria-label="The Blue Veil on GitHub (opens in a new tab)" title="View on GitHub · opens in a new tab">${github}</a><button id="sound" class="icon-button" aria-label="Turn game sound off" aria-pressed="true" title="Sound · dialogue, ambience and cards">${speaker}</button><button id="fullscreen-toggle" class="icon-button" aria-label="Enter fullscreen" aria-pressed="false" title="Enter fullscreen"><svg viewBox="0 0 24 24" aria-hidden="true"><path id="fullscreen-glyph" d="${fullscreenPaths.enter}"/></svg></button><button id="menu-toggle" class="icon-button" aria-label="Open game menu" title="Menu · Esc"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16M17 4v16"/></svg></button></div>
  <section id="outside" aria-label="Outside the tent"><button id="enter" aria-label="Enter the tent"><span class="desktop-prompt">PRESS SPACE TO ENTER</span><span class="touch-prompt">TAP TO ENTER</span></button></section>
  <button id="skip-entry" class="quiet-action" aria-label="Skip the walk" hidden>SKIP ▸</button>
  <section id="inside" aria-label="Your tarot reading" hidden>
    <div id="card-focus" aria-hidden="true"></div>
    <div id="speech" class="speech" tabindex="-1"><p id="speech-title" hidden></p><p id="dialogue" aria-hidden="true"></p><p id="reader-announcement" class="sr-only" aria-live="polite" aria-atomic="true"></p><div class="speech-actions"><button id="previous-line" title="Previous part of the reading" hidden>Back</button><button id="continue-reading" title="Space or click to continue" hidden>Next</button></div></div>
    <form id="question-form" autocomplete="off"><label class="sr-only" for="question">Your question</label><div class="question-shell"><span aria-hidden="true">&gt;</span><textarea id="question" rows="1" maxlength="1000" placeholder="Type your question..." aria-describedby="question-help"></textarea><button id="submit-question" aria-label="Ask the reader" type="submit" title="Ask · Enter">↵</button></div><span id="question-help" class="sr-only">Ask in 3 to 500 characters. Avoid names and personal details. Enter sends; Shift and Enter adds a line.</span></form>
    <div id="table" hidden><p id="asked-question" class="sr-only"></p><button id="deck" class="deck" aria-label="Draw card 1 of 3">${Array.from({ length: 8 }, (_, index) => `<span class="deck-layer" style="--layer:${8 - index}" aria-hidden="true"></span>`).join('')}<img src="${assetUrl('/assets/deck/back.png')}" alt="Tarot deck, face down" draggable="false"><span class="deck-hint">DRAW</span></button><div id="spread" class="spread" aria-label="Your three cards"></div></div>
    <div id="result-choices" hidden><button id="ask-again" class="game-choice" aria-label="Ask again">Ask again</button><button id="delete-reading" class="game-choice" aria-label="Delete this reading">Forget this reading</button></div>
    <p id="allowance-label" class="sr-only" aria-live="polite"></p>
    <div id="error-box" role="alert" hidden><span id="error-message"></span><button id="reconnect" class="quiet-action">RECONNECT ▸</button></div>
  </section>
  <div id="toast" class="toast" role="status" hidden></div>
</main>
<dialog id="menu-dialog" class="game-dialog"><h1>PAUSED</h1><p id="mode-label">The Blue Veil</p><div class="menu-options"><button id="resume-game">Continue</button><button id="fullscreen">Fullscreen</button><button id="about-deck">The deck & credits</button><button id="about-privacy">Privacy & game rules</button><button id="release-reading" hidden>Forget this reading</button></div><p id="reset-label" class="menu-note"></p><p class="menu-note">ESC TO RETURN</p></dialog>
<dialog id="info-dialog" class="game-dialog info-dialog"><button id="close-dialog" class="dialog-close" aria-label="Close dialog">×</button><div id="info-content"></div></dialog>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const exteriorScene = loading.adopt(document.querySelector<HTMLElement>('.exterior-scene')!);
const client = new Client(),
  sound = new Sound();
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const menu = $<HTMLDialogElement>('menu-dialog'),
  info = $<HTMLDialogElement>('info-dialog');
type Stage = 'outside' | 'entering' | 'asking' | 'drawing' | 'pending' | 'result' | 'limit';
type Line = { text: string; title?: string; cardIndex?: number };
let stage: Stage = 'outside',
  session: SessionView | undefined,
  reading: ReadingView | undefined;
let busy = false,
  typing = false,
  spokenText = '',
  resultFinished = false,
  lineIndex = 0;
let lines: Line[] = [],
  renderedCards = '';
let pendingSubmit: { question: string; id: string } | undefined,
  pendingDraw: { index: number; id: string } | undefined;
let entranceBlending = false;
let entranceAnimations: Animation[] = [];
let entranceRequest: AbortController | undefined;
let completingReading: string | undefined;
let pollTimer: ReturnType<typeof setTimeout> | undefined,
  resetTimer: ReturnType<typeof setTimeout> | undefined,
  typeTimer: ReturnType<typeof setInterval> | undefined,
  toastTimer: ReturnType<typeof setTimeout> | undefined;
const videos = ['exterior-video', 'interior-video', 'reading-video', 'entrance-video'].map((id) =>
  $<HTMLVideoElement>(id),
);
const pixelScenes = createPixelScenes(exteriorScene);
const cardMotion = createCardMotion();
const cardFocus = createCardFocus($('card-focus'), () => sound.effect('inspect'));
const readingOrb = createReadingOrb($<HTMLVideoElement>('reading-video'), (active, phase) =>
  sound.orb(active, phase),
);

function visibility() {
  const paused = document.hidden || menu.open || info.open;
  for (const video of videos) {
    if (video.id === 'reading-video') continue; // The orb owns its playback boundary.
    const active =
      ((stage === 'outside' || (stage === 'entering' && entranceBlending)) &&
        video.id === 'exterior-video') ||
      (stage === 'entering' && video.id === 'entrance-video') ||
      (['asking', 'drawing', 'result', 'limit'].includes(stage) && video.id === 'interior-video') ||
      (stage === 'pending' && video.id === 'reading-video');
    if (active && !paused && !reduced.matches) void video.play().catch(() => undefined);
    else video.pause();
  }
  sound.visibility(paused);
  readingOrb.update(paused, reduced.matches);
  sound.scene(
    stage === 'outside' || stage === 'entering',
    stage === 'entering' && !reduced.matches ? $<HTMLVideoElement>('entrance-video') : undefined,
  );
  pixelScenes.update(stage, paused, reduced.matches, entranceBlending);
  cardMotion.update(paused, reduced.matches);
  cardFocus.update(paused);
  if (stage === 'entering')
    for (const animation of entranceAnimations) {
      if (reduced.matches) animation.finish();
      else if (paused) animation.pause();
      else animation.play();
    }
}
function setStage(next: Stage) {
  if (next !== 'pending') readingOrb.cancel();
  cardFocus.show();
  stage = next;
  document.body.dataset.stage = next;
  $('outside').hidden = next !== 'outside';
  $('skip-entry').hidden = next !== 'entering';
  $('inside').hidden = next === 'outside' || next === 'entering';
  $('question-form').hidden = next !== 'asking';
  $('table').hidden = !['drawing', 'pending', 'result'].includes(next);
  $('continue-reading').hidden = true;
  $('previous-line').hidden = true;
  $('result-choices').hidden = true;
  $('release-reading').hidden = !reading;
  $('speech-title').hidden = true;
  clearInterval(typeTimer);
  typing = false;
  sound.stopVoice();
  sound.speaking(false);
  visibility();
}
function syncReadingNavigation() {
  const ready = stage === 'result' && !typing;
  $('continue-reading').hidden = !ready || resultFinished;
  $('previous-line').hidden = !ready || lineIndex === 0;
}
function finishTyping(interrupted = true) {
  clearInterval(typeTimer);
  if (interrupted) sound.stopVoice();
  typing = false;
  sound.speaking(false);
  $('dialogue').textContent = spokenText;
  $('speech').classList.remove('typing');
  syncReadingNavigation();
}
function say(text: string, animate = true, title?: string) {
  clearInterval(typeTimer);
  sound.stopVoice();
  spokenText = text;
  $('speech-title').textContent = title ?? '';
  $('speech-title').hidden = !title;
  $('reader-announcement').textContent = [title, text].filter(Boolean).join('. ');
  $('dialogue').textContent = '';
  $('dialogue').scrollTop = 0;
  typing = animate && !reduced.matches;
  sound.speaking(typing);
  $('speech').classList.toggle('typing', typing);
  syncReadingNavigation();
  if (!typing) {
    finishTyping();
    return;
  }
  const characters = Array.from(text);
  let count = 0;
  typeTimer = setInterval(() => {
    if (menu.open || info.open || document.hidden) return;
    const revealed = characters.slice(count, count + 2).join('');
    count += 2;
    $('dialogue').textContent = characters.slice(0, count).join('');
    sound.voice(revealed);
    if (count >= characters.length) finishTyping(false);
  }, 30);
}
function toast(text: string) {
  clearTimeout(toastTimer);
  $('toast').textContent = text;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => ($('toast').hidden = true), 4500);
}
function showError(error: unknown) {
  const message =
    error instanceof Error ? error.message : 'The connection slipped away. Try again.';
  if (stage === 'outside' || stage === 'entering') {
    toast(message);
    return;
  }
  $('error-message').textContent = message;
  $('error-box').hidden = false;
  if (error instanceof ApiError && error.code === 'DAILY_LIMIT') {
    setStage('limit');
    say('You ask too much. Come back tomorrow.');
    clearError();
  }
}
function clearError() {
  $('error-box').hidden = true;
}
function syncSession(value: SessionView) {
  const spentCandle =
    session && value.remaining < session.remaining && value.resetsAt === session.resetsAt;
  session = value;
  client.csrf = value.csrf;
  $('mode-label').textContent =
    value.mode === 'local' ? 'Local preview · sample readings' : 'The Blue Veil';
  $('allowance-label').textContent =
    `${value.remaining} ${value.remaining === 1 ? 'QUESTION' : 'QUESTIONS'} REMAINING`;
  $('reset-label').textContent =
    `${value.remaining} questions left · renews at midnight in Bangkok`;
  document
    .querySelectorAll('.scene-candle')
    .forEach((candle, index) => candle.classList.toggle('extinguished', index >= value.remaining));
  if (spentCandle && stage !== 'outside' && stage !== 'entering') sound.effect('snuff');
  clearTimeout(resetTimer);
  resetTimer = setTimeout(
    () => void refreshAllowance(),
    Math.max(1000, value.resetsAt - Date.now() + 1000),
  );
}
async function updateSession() {
  syncSession(await client.status());
}
async function refreshAllowance() {
  if (!session || document.hidden) return;
  try {
    await updateSession();
    if (stage === 'limit' && session.remaining > 0) showAsking();
  } catch (e) {
    showError(e);
  }
}
function orbPulse() {
  const orb = document.querySelector<HTMLElement>('.orb-aura')!;
  orb.classList.remove('pulse');
  void orb.offsetWidth;
  orb.classList.add('pulse');
}
function showAsking() {
  clearTimeout(pollTimer);
  reading = undefined;
  pendingDraw = undefined;
  renderedCards = '';
  lines = [];
  clearError();
  setStage((session?.remaining ?? 3) > 0 ? 'asking' : 'limit');
  say(stage === 'limit' ? 'You ask too much. Come back tomorrow.' : 'What do you wish to know?');
  if (stage === 'asking')
    setTimeout(() => {
      if (stage === 'asking' && !menu.open && !info.open)
        $('question').focus({ preventScroll: true });
    }, 250);
}
function cardFigure(id: string, reversed: boolean, lazy = false) {
  const card = CARD_MAP.get(id)!;
  const figure = document.createElement('figure');
  figure.className = 'tarot-card';
  const art = createCardArt(
    card,
    reversed,
    `${card.name}, ${reversed ? 'reversed' : 'upright'}`,
    lazy,
  );
  const caption = document.createElement('figcaption');
  caption.textContent = card.name;
  figure.append(art, caption);
  return figure;
}
function renderTable() {
  if (!reading) return;
  $('asked-question').textContent = reading.question;
  const signature =
    reading.cards.map((card) => `${card.id}:${card.reversed}`).join(',') + `:${stage === 'result'}`;
  if (signature !== renderedCards) {
    renderedCards = signature;
    $('spread').replaceChildren();
    for (let index = 0; index < 3; index++) {
      const slot = document.createElement('div');
      slot.className = 'card-slot';
      const card = reading.cards[index];
      if (card) {
        slot.classList.add('revealed');
        if (stage === 'result') {
          const button = document.createElement('button');
          button.className = 'table-card';
          button.setAttribute('aria-label', `Hear about ${CARD_MAP.get(card.id)!.name}`);
          button.append(cardFigure(card.id, card.reversed));
          button.addEventListener('click', () => {
            lineIndex = lines.findIndex((line) => line.cardIndex === index);
            showLine();
          });
          slot.append(button);
        } else slot.append(cardFigure(card.id, card.reversed));
      } else {
        const number = document.createElement('span');
        number.textContent = ['I', 'II', 'III'][index];
        number.setAttribute('aria-label', `Undrawn card: ${POSITIONS[index]}`);
        slot.append(number);
      }
      $('spread').append(slot);
    }
  }
  const count = reading.cards.length;
  $('deck').setAttribute('aria-label', `Draw card ${Math.min(count + 1, 3)} of 3`);
  $<HTMLButtonElement>('deck').disabled = busy || stage !== 'drawing' || count === 3;
  $('deck').classList.toggle('spent', count === 3);
}
// Keep every word of the answer, but deliver it in short dialogue beats.
function splitDialogue(
  text: string,
  limit = window.matchMedia('(max-aspect-ratio: 1/1)').matches ? 90 : 210,
) {
  const pages: string[] = [];
  let remaining = text.trim();
  while (Array.from(remaining).length > limit) {
    const characters = Array.from(remaining);
    let cut = characters.slice(0, limit).join('').lastIndexOf(' ');
    if (cut < limit / 2) cut = characters.slice(0, limit).join('').length;
    pages.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) pages.push(remaining);
  return pages;
}
function showLine() {
  resultFinished = false;
  $('result-choices').hidden = true;
  const line = lines[lineIndex];
  if (!line) return;
  if (['continue-reading', 'previous-line'].includes(document.activeElement?.id ?? ''))
    $('speech').focus({ preventScroll: true });
  cardFocus.show(line.cardIndex === undefined ? undefined : reading?.cards[line.cardIndex]);
  say(line.text, true, line.title);
  document
    .querySelectorAll('.card-slot')
    .forEach((slot, index) => slot.classList.toggle('speaking', line.cardIndex === index));
}
function advanceReading() {
  if (typing) {
    finishTyping();
    return;
  }
  if (stage !== 'result' || resultFinished) return;
  if (lineIndex < lines.length - 1) {
    lineIndex++;
    showLine();
  } else {
    resultFinished = true;
    cardFocus.show();
    syncReadingNavigation();
    $('result-choices').hidden = false;
    $('ask-again').focus({ preventScroll: true });
  }
}
function showResult() {
  if (!reading?.answer) return;
  setStage('result');
  lineIndex = 0;
  lines = [];
  reading.answer.cards.forEach((item, index) => {
    const card = CARD_MAP.get(item.cardId)!;
    for (const text of splitDialogue(item.interpretation))
      lines.push({
        text,
        title: `${card.name}${reading!.cards[index].reversed ? ' (Reverse)' : ''}`,
        cardIndex: index,
      });
  });
  for (const text of splitDialogue(reading.answer.synthesis)) lines.push({ text });
  for (const text of splitDialogue(reading.answer.reflection)) lines.push({ text });
  renderTable();
  showLine();
  $(typing ? 'speech' : 'continue-reading').focus({ preventScroll: true });
}
function beginReading() {
  readingOrb.start();
  setStage('pending');
  renderTable();
  say('Be still. Let me listen...');
}
async function revealReading(value: ReadingView, waitingForOrb: boolean) {
  const id = value.id;
  completingReading = id;
  const boundary = waitingForOrb ? readingOrb.finish() : Promise.resolve(true);
  try {
    const [, finished] = await Promise.all([updateSession(), boundary]);
    if (finished && reading?.id === id && (!waitingForOrb || stage === 'pending')) showResult();
  } catch (error) {
    if (reading?.id === id) showError(error);
  } finally {
    if (completingReading === id) completingReading = undefined;
  }
}
async function acceptReading(value: ReadingView, newSpread = false) {
  // Reconnect can race a final poll. Keep a ready answer while its last loop runs.
  if (completingReading === value.id && stage === 'pending') return;
  reading = value;
  clearError();
  if (newSpread && value.cards.length === 3 && value.status === 'complete' && stage !== 'pending')
    beginReading();
  if (value.status === 'complete') {
    clearTimeout(pollTimer);
    // Mark the answer ready immediately, before any allowance refresh can delay
    // the boundary. Restoring an already completed reading skips this ritual.
    // Waiting must not hold the draw lock and disable Forget/menu controls.
    void revealReading(value, stage === 'pending');
    return;
  }
  if (value.status === 'failed') {
    await updateSession();
    showAsking();
    showError(new Error(value.message ?? 'The vision faded. Your question has been restored.'));
    return;
  }
  if (value.status === 'drawing') {
    setStage('drawing');
    renderTable();
    say(
      [
        'Draw three cards. Take your time.',
        'The first has spoken. Draw another.',
        'One more card.',
      ][value.cards.length] ?? '',
    );
    return;
  }
  if (stage !== 'pending') {
    beginReading();
  }
  schedulePoll();
}
function schedulePoll(delay = 1800) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(() => {
    if (!reading) return;
    if (document.hidden) {
      schedulePoll(5000);
      return;
    }
    const id = reading.id;
    void client
      .read(id)
      .then((value) => {
        if (reading?.id === id && stage === 'pending') return acceptReading(value);
      })
      .catch((e) => {
        showError(e);
        schedulePoll(6000);
      });
  }, delay);
}
async function reconnect() {
  clearError();
  try {
    syncSession(await client.session());
    const id = session?.activeReading ?? session?.latestReading;
    if (id) await acceptReading(await client.read(id));
    else showAsking();
  } catch (e) {
    showError(e);
  }
}
async function enter() {
  if (busy || stage !== 'outside') return;
  busy = true;
  try {
    syncSession(await client.session());
    try {
      sessionStorage.setItem('blue-veil-entered', '1');
    } catch {
      /* Resume also works through the server cookie. */
    }
    if (reduced.matches || session?.activeReading) {
      await completeEntry();
      return;
    }
    const video = $<HTMLVideoElement>('entrance-video');
    const request = new AbortController();
    entranceRequest = request;
    $('enter').hidden = true;
    $('skip-entry').hidden = false;
    try {
      await prepareEntrance(video, request.signal);
      pixelScenes.prepareEntrance();
      // Keep the curtains moving until their opening matches the walking clip.
      await waitForCurtainMatch($<HTMLVideoElement>('exterior-video'), request.signal);
    } catch {
      if (request.signal.aborted) return;
      await completeEntry();
      return;
    }
    if (reduced.matches) {
      await completeEntry();
      return;
    }
    entranceBlending = true;
    setStage('entering');
    // Both clips keep moving during the short blend at the matched curtain phase.
    entranceAnimations = document.querySelector('.entrance-scene')!.getAnimations();
    if (document.hidden || menu.open || info.open)
      entranceAnimations.forEach((animation) => animation.pause());
    await Promise.all(entranceAnimations.map((animation) => animation.finished)).catch(() => {});
    entranceAnimations = [];
    entranceBlending = false;
    if ((stage as Stage) !== 'entering') return;
    if (reduced.matches) {
      await completeEntry();
      return;
    }
    visibility();
    await video.play().catch(() => completeEntry());
    setTimeout(() => {
      if (stage === 'entering') void completeEntry();
    }, 11000);
  } catch (e) {
    showError(e);
  } finally {
    entranceRequest = undefined;
    busy = false;
  }
}
async function completeEntry() {
  if (stage !== 'entering' && stage !== 'outside') return;
  entranceRequest?.abort();
  setStage('asking');
  try {
    if (session?.activeReading) await acceptReading(await client.read(session.activeReading));
    else showAsking();
  } catch (e) {
    showAsking();
    showError(e);
  }
}
async function submitQuestion(event: SubmitEvent) {
  event.preventDefault();
  if (busy) return;
  const question = $<HTMLTextAreaElement>('question').value.trim();
  if (Array.from(question).length < 3 || Array.from(question).length > 500) {
    showError(new Error('Ask a question between 3 and 500 characters.'));
    return;
  }
  busy = true;
  clearError();
  $<HTMLButtonElement>('submit-question').disabled = true;
  if (pendingSubmit?.question !== question) pendingSubmit = { question, id: crypto.randomUUID() };
  try {
    const value = await client.submit(question, pendingSubmit.id);
    pendingSubmit = undefined;
    await updateSession();
    orbPulse();
    await acceptReading(value);
    $('deck').focus({ preventScroll: true });
  } catch (e) {
    showError(e);
    if (e instanceof ApiError && e.code === 'ACTIVE_READING') await reconnect();
  } finally {
    busy = false;
    $<HTMLButtonElement>('submit-question').disabled = false;
    if (stage === 'drawing') {
      renderTable();
      $('deck').focus({ preventScroll: true });
    }
  }
}
async function drawCard() {
  if (busy || !reading || stage !== 'drawing' || reading.cards.length >= 3) return;
  busy = true;
  renderTable();
  const index = reading.cards.length;
  pendingDraw ??= { index, id: crypto.randomUUID() };
  try {
    const value = await client.draw(reading.id, pendingDraw.index, pendingDraw.id);
    pendingDraw = undefined;
    reading = value;
    renderTable();
    sound.effect('draw', (index - 1) * 0.18);
    orbPulse();
    await cardMotion.deal($('deck'), $('spread').children[index] as HTMLElement);
    sound.effect('land', (index - 1) * 0.18);
    await acceptReading(value, value.cards.length === 3);
  } catch (e) {
    showError(e);
  } finally {
    busy = false;
    if (stage === 'drawing') renderTable();
  }
}
async function release() {
  if (!reading || busy) return;
  busy = true;
  try {
    await client.cancel(reading.id);
    await updateSession();
    menu.close();
    showAsking();
    toast('Your question and reading have been forgotten.');
  } catch (e) {
    showError(e);
  } finally {
    busy = false;
  }
}
function toggleMenu() {
  if (info.open) {
    info.close();
    return;
  }
  if (menu.open) menu.close();
  else menu.showModal();
  visibility();
}
function showInfo(html: string) {
  menu.close();
  $('info-content').innerHTML = html;
  info.showModal();
  visibility();
}
$('enter').addEventListener('click', () => void enter());
$('skip-entry').addEventListener('click', () => void completeEntry());
$<HTMLVideoElement>('entrance-video').addEventListener('ended', () => void completeEntry());
$('question-form').addEventListener('submit', (event) => void submitQuestion(event as SubmitEvent));
function fitQuestionText() {
  const input = $<HTMLTextAreaElement>('question');
  if (!input.clientWidth) return;
  // Fit the text itself, so the shell's flex alignment centers it vertically.
  // Long questions retain the existing height cap and native scrolling.
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight}px`;
}
$('question').addEventListener('input', fitQuestionText);
let questionWidth = 0;
let questionFitFrame = 0;
new ResizeObserver(([entry]) => {
  if (entry.contentRect.width === questionWidth) return;
  questionWidth = entry.contentRect.width;
  // Resize outside observer delivery so changing the textarea height does not
  // trigger an undelivered resize notification during the first scene reveal.
  cancelAnimationFrame(questionFitFrame);
  questionFitFrame = requestAnimationFrame(fitQuestionText);
}).observe($('question'));
window.addEventListener('resize', fitQuestionText);
void document.fonts.ready.then(fitQuestionText);
$('question').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $<HTMLFormElement>('question-form').requestSubmit();
  }
});
$('deck').addEventListener('click', () => void drawCard());
$('speech').addEventListener('click', (event) => {
  if ((event.target as Element).closest('button')) return;
  if (stage === 'result') advanceReading();
  else finishTyping();
});
$('continue-reading').addEventListener('click', advanceReading);
$('previous-line').addEventListener('click', () => {
  if (lineIndex > 0) {
    lineIndex--;
    showLine();
  }
});
$('ask-again').addEventListener('click', () => {
  $<HTMLTextAreaElement>('question').value = '';
  showAsking();
  fitQuestionText();
});
$('reconnect').addEventListener('click', () => void reconnect());
$('release-reading').addEventListener('click', () => void release());
$('delete-reading').addEventListener('click', () => void release());
$('menu-toggle').addEventListener('click', toggleMenu);
$('resume-game').addEventListener('click', () => menu.close());
$('close-dialog').addEventListener('click', () => info.close());
for (const dialog of [menu, info]) {
  dialog.addEventListener('close', visibility);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}
// Capture the entry gesture before its scene/dialogue work begins. Leave the
// speaker button to its own handler so muting never briefly starts the sound.
function activateSound(event: Event) {
  if (event.target instanceof Element && event.target.closest('#sound')) return;
  void sound.activate().catch(() => {
    // Keep gameplay usable if audio is blocked; the next gesture can retry.
  });
}
document.addEventListener('click', activateSound, { capture: true });
document.addEventListener('keydown', activateSound, { capture: true });
$('sound').addEventListener('click', async () => {
  const button = $<HTMLButtonElement>('sound');
  button.disabled = true;
  try {
    const on = await sound.toggle();
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', `Turn game sound ${on ? 'off' : 'on'}`);
  } catch {
    toast('Sound is unavailable in this browser.');
  } finally {
    button.disabled = false;
  }
});
function syncFullscreen() {
  const active = Boolean(document.fullscreenElement);
  const label = active ? 'Exit fullscreen' : 'Enter fullscreen';
  $('fullscreen-toggle').setAttribute('aria-label', label);
  $('fullscreen-toggle').setAttribute('title', label);
  $('fullscreen-toggle').setAttribute('aria-pressed', String(active));
  $('fullscreen-glyph').setAttribute('d', active ? fullscreenPaths.exit : fullscreenPaths.enter);
  $('fullscreen').textContent = active ? 'Exit fullscreen' : 'Fullscreen';
}
async function toggleFullscreen() {
  const controls = [$<HTMLButtonElement>('fullscreen-toggle'), $<HTMLButtonElement>('fullscreen')];
  controls.forEach((button) => (button.disabled = true));
  menu.close();
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    toast('Fullscreen is unavailable here.');
  } finally {
    controls.forEach((button) => (button.disabled = false));
    syncFullscreen();
  }
}
$('fullscreen-toggle').addEventListener('click', () => void toggleFullscreen());
$('fullscreen').addEventListener('click', () => void toggleFullscreen());
document.addEventListener('fullscreenchange', syncFullscreen);
syncFullscreen();
$('about-privacy').addEventListener('click', () =>
  showInfo(
    '<h2>Inside the tent</h2><p>Three questions per browser each day, with a shared three-question allowance for your network address. People on the same Wi-Fi or shared connection may use the same allowance. Private browsing does not reset that network allowance. Each accepted question extinguishes one candle; allowances renew at midnight in Bangkok.</p><p>A browser cookie keeps your readings private to your visit. To limit repeat visits, the server converts your network address into a secret-keyed daily identifier. Raw IP addresses and MAC addresses are not saved in the game database. IPv6 addresses in the same network prefix share an allowance. Network counters expire within 48 hours, followed by scheduled cleanup and storage expiration; they are not a permanent device identity.</p><p>Questions and readings remain available for up to 24 hours. Forgetting a reading deletes its content; daily counts remain. The deployed database uses encryption at rest, and requests use HTTPS. No sign-in is required.</p><p>The live game uses AWS Bedrock, potentially outside Thailand. Avoid names, addresses, passwords and personal details. Questions, network addresses and daily identifiers are not written to application logs. Network identifiers are never sent to the reading model.</p><p>The local demo uses sample readings and sends no question to AI unless Bedrock mode is explicitly configured.</p><p>For entertainment and reflection. The cards do not establish facts about the future or replace professional advice.</p>',
  ),
);
$('about-deck').addEventListener('click', () => {
  showInfo(
    '<h2>The Blue Veil deck</h2><p>78 cards: 22 Major Arcana and 56 Minor Arcana. Three perspectives: the situation, the hidden influence, and the path ahead. Cards may be upright or reversed.</p><p>Card faces generated for The Blue Veil with OpenAI image generation. Card back from Pixel Tarot Deck by <a href="https://chorline.itch.io/pixeltarotdeck" target="_blank" rel="noopener noreferrer">Chorline</a>, used unchanged. Interface font: VT323, under the SIL Open Font License.</p><p>Music: <a href="https://www.scottbuckley.com.au/library/a-dragons-lullaby-2023/" target="_blank" rel="noopener noreferrer">A Dragon&rsquo;s Lullaby (2023 Remaster)</a> by <a href="https://www.scottbuckley.com.au/" target="_blank" rel="noopener noreferrer">Scott Buckley</a> — released under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>. Original recording unchanged; volume and repeat fades applied in-game. <a href="/licenses/a-dragons-lullaby.txt" target="_blank" rel="noopener noreferrer">Music attribution</a>.</p><p>Scene pixel effects adapted from <a href="https://collidingscopes.github.io/video-to-pixel-art/" target="_blank" rel="noopener noreferrer">Video-to-Pixel-Art</a> by Alan Ang / collidingScopes, under the <a href="/licenses/video-to-pixel-art-MIT.txt" target="_blank" rel="noopener noreferrer">MIT license</a>.</p><div id="deck-filters" role="group" aria-label="Choose a card suit"></div><p id="deck-group-label" aria-live="polite"></p><div id="deck-gallery"></div>',
  );
  for (const group of CARD_GROUPS) {
    const button = document.createElement('button');
    button.textContent = group.name;
    button.dataset.group = group.id;
    button.setAttribute('aria-pressed', String(group.id === 'major'));
    button.addEventListener('click', () => {
      $('deck-filters')
        .querySelectorAll('button')
        .forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
      const cards = CARDS.filter((card) => card.group === group.id);
      $('deck-group-label').textContent = `${group.name} · ${cards.length} cards`;
      $('deck-gallery').replaceChildren(...cards.map((card) => cardFigure(card.id, false, true)));
    });
    $('deck-filters').append(button);
  }
  $('deck-filters').querySelector<HTMLButtonElement>('button')!.click();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!menu.open && !info.open) {
      event.preventDefault();
      toggleMenu();
    }
    return;
  }
  if (
    menu.open ||
    info.open ||
    event.isComposing ||
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement
  )
    return;
  if (event.code !== 'Space') return;
  if ((event.target as Element).closest?.('a')) return;
  const button = (event.target as Element).closest?.('button');
  if (button && !['enter', 'continue-reading', 'skip-entry'].includes(button.id)) return;
  if (stage === 'outside') {
    event.preventDefault();
    void enter();
  } else if (stage === 'entering') {
    event.preventDefault();
    void completeEntry();
  } else if (stage === 'result') {
    event.preventDefault();
    advanceReading();
  }
});
document.addEventListener('visibilitychange', () => {
  visibility();
  if (!document.hidden && session && Date.now() >= session.resetsAt) void refreshAllowance();
});
reduced.addEventListener('change', () => {
  visibility();
  if (reduced.matches && entranceRequest) void completeEntry();
  if (reduced.matches) finishTyping();
});
window.addEventListener('online', () => {
  if (stage !== 'outside' && stage !== 'entering') void reconnect();
});
window.addEventListener('pagehide', () => readingOrb.cancel());
setStage('outside');
try {
  if (sessionStorage.getItem('blue-veil-entered') === '1') {
    setStage('asking');
    say('You have returned.', false);
    void reconnect();
  }
} catch {
  /* Browser storage is optional; the secure cookie owns game state. */
}
