import './style.css';
import './ui.css';
import { CARDS, CARD_MAP, POSITIONS, type ReadingView, type SessionView } from '../shared/cards';
import { ApiError, Client } from './api';
import { Sound } from './audio';
import { createPixelScenes } from './pixel-scenes';

const speaker =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h5l5-5v16l-5-5H3zM17 8v8m4-11v14"/></svg>';
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<main id="game" aria-label="The Blue Veil tarot game">
  <div class="world" aria-hidden="true">
    <div class="scene-frame exterior-scene"><img class="scene-image" src="/assets/scenes/exterior.jpg" alt=""><video id="exterior-video" class="scene-image" muted loop playsinline preload="auto" poster="/assets/scenes/exterior.jpg" src="/assets/scenes/exterior-master.mp4?v=live-pixel-1"></video></div>
    <div class="scene-frame interior-scene"><img class="scene-image" src="/assets/scenes/interior-unlit.png" alt=""><video id="interior-video" class="scene-image figure-video" muted loop playsinline preload="none" src="/assets/scenes/interior-master.mp4?v=live-pixel-1"></video><video id="reading-video" class="scene-image figure-video reading-video" muted loop playsinline preload="none" src="/assets/scenes/reading-master.mp4?v=live-pixel-1"></video><div class="orb-aura"></div><div class="scene-candle candle-left"><i></i><b></b></div><div class="scene-candle candle-right"><i></i><b></b></div><div class="scene-candle candle-short"><i></i><b></b></div></div>
    <div class="scene-frame entrance-scene"><video id="entrance-video" class="scene-image" muted playsinline preload="none" src="/assets/scenes/entrance-master.mp4?v=live-pixel-1"></video></div>
    <div class="vignette"></div><div class="motes">${Array.from({ length: 9 }, (_, i) => `<i style="--n:${i}"></i>`).join('')}</div>
  </div>
  <div class="game-controls"><span id="preview-badge" hidden title="Local preview — sample readings">DEMO</span><button id="sound" class="icon-button" aria-label="Turn ambient sound on" aria-pressed="false" title="Sound">${speaker}</button><button id="menu-toggle" class="icon-button" aria-label="Open game menu" title="Menu · Esc"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16M17 4v16"/></svg></button></div>
  <section id="outside" aria-label="Outside the tent"><button id="enter" aria-label="Enter the tent"><span class="desktop-prompt">PRESS SPACE TO ENTER</span><span class="touch-prompt">TAP TO ENTER</span></button></section>
  <button id="skip-entry" class="quiet-action" aria-label="Skip the walk" hidden>SKIP ▸</button>
  <section id="inside" aria-label="Your tarot reading" hidden>
    <div id="speech" class="speech"><p id="speech-title" hidden></p><p id="dialogue" aria-hidden="true"></p><p id="reader-announcement" class="sr-only" aria-live="polite" aria-atomic="true"></p><div class="speech-actions"><button id="previous-line" aria-label="Previous part of the reading" hidden>◂</button><button id="continue-reading" aria-label="Continue reading" title="Space or click to continue" hidden>▾</button></div></div>
    <form id="question-form" autocomplete="off"><label class="sr-only" for="question">Your question</label><div class="question-shell"><span aria-hidden="true">&gt;</span><textarea id="question" rows="2" maxlength="1000" placeholder="Type your question..." aria-describedby="question-help"></textarea><button id="submit-question" aria-label="Ask the reader" type="submit" title="Ask · Enter">↵</button></div><span id="question-help" class="sr-only">Ask in 3 to 500 characters. Avoid names and personal details. Enter sends; Shift and Enter adds a line.</span></form>
    <div id="table" hidden><p id="asked-question" class="sr-only"></p><button id="deck" class="deck" aria-label="Draw card 1 of 3"><img src="/assets/deck/back.png" alt="Tarot deck, face down" draggable="false"><span class="deck-hint">DRAW</span></button><div id="spread" class="spread" aria-label="Your three cards"></div></div>
    <div id="result-choices" hidden><button id="ask-again" class="game-choice" aria-label="Ask again">Ask again</button><button id="delete-reading" class="game-choice" aria-label="Delete this reading">Forget this reading</button></div>
    <p id="allowance-label" class="sr-only" aria-live="polite"></p>
    <div id="error-box" role="alert" hidden><span id="error-message"></span><button id="reconnect" class="quiet-action">RECONNECT ▸</button></div>
  </section>
  <div id="toast" class="toast" role="status" hidden></div>
</main>
<dialog id="menu-dialog" class="game-dialog"><h1>PAUSED</h1><p id="mode-label">The Blue Veil</p><div class="menu-options"><button id="resume-game">Continue</button><button id="fullscreen">Fullscreen</button><button id="about-deck">The deck & credits</button><button id="about-privacy">Privacy & game rules</button><button id="release-reading" hidden>Forget this reading</button></div><p id="reset-label" class="menu-note"></p><p class="menu-note">ESC TO RETURN</p></dialog>
<dialog id="info-dialog" class="game-dialog info-dialog"><button id="close-dialog" class="dialog-close" aria-label="Close dialog">×</button><div id="info-content"></div></dialog>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
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
let pollTimer: ReturnType<typeof setTimeout> | undefined,
  resetTimer: ReturnType<typeof setTimeout> | undefined,
  typeTimer: ReturnType<typeof setInterval> | undefined,
  toastTimer: ReturnType<typeof setTimeout> | undefined;
const videos = ['exterior-video', 'interior-video', 'reading-video', 'entrance-video'].map((id) =>
  $<HTMLVideoElement>(id),
);
const pixelScenes = createPixelScenes();

function visibility() {
  const paused = document.hidden || menu.open || info.open;
  for (const video of videos) {
    const active =
      (stage === 'outside' && video.id === 'exterior-video') ||
      (stage === 'entering' && video.id === 'entrance-video') ||
      (['asking', 'drawing', 'result', 'limit'].includes(stage) && video.id === 'interior-video') ||
      (stage === 'pending' && video.id === 'reading-video');
    if (active && !paused && !reduced.matches) void video.play().catch(() => undefined);
    else video.pause();
  }
  sound.visibility(paused);
  pixelScenes.update(stage, paused, reduced.matches);
}
function setStage(next: Stage) {
  stage = next;
  document.body.dataset.stage = next;
  $('outside').hidden = next !== 'outside';
  $('skip-entry').hidden = next !== 'entering';
  $('inside').hidden = next === 'outside' || next === 'entering';
  $('question-form').hidden = next !== 'asking';
  $('table').hidden = !['drawing', 'pending', 'result'].includes(next);
  $('continue-reading').hidden = next !== 'result';
  $('previous-line').hidden = true;
  $('result-choices').hidden = true;
  $('release-reading').hidden = !reading;
  $('speech-title').hidden = true;
  clearInterval(typeTimer);
  typing = false;
  visibility();
}
function finishTyping() {
  clearInterval(typeTimer);
  typing = false;
  $('dialogue').textContent = spokenText;
  $('speech').classList.remove('typing');
}
function say(text: string, animate = true, title?: string) {
  clearInterval(typeTimer);
  spokenText = text;
  $('speech-title').textContent = title ?? '';
  $('speech-title').hidden = !title;
  $('reader-announcement').textContent = [title, text].filter(Boolean).join('. ');
  $('dialogue').textContent = '';
  typing = animate && !reduced.matches;
  $('speech').classList.toggle('typing', typing);
  if (!typing) {
    finishTyping();
    return;
  }
  const characters = Array.from(text);
  let count = 0;
  typeTimer = setInterval(() => {
    if (menu.open || info.open || document.hidden) return;
    count += 2;
    $('dialogue').textContent = characters.slice(0, count).join('');
    if (count % 6 === 0) sound.voice();
    if (count >= characters.length) finishTyping();
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
  session = value;
  client.csrf = value.csrf;
  $('preview-badge').hidden = value.mode !== 'local';
  $('mode-label').textContent =
    value.mode === 'local' ? 'Local preview · sample readings' : 'The Blue Veil';
  $('allowance-label').textContent =
    `${value.remaining} ${value.remaining === 1 ? 'QUESTION' : 'QUESTIONS'} REMAINING`;
  $('reset-label').textContent =
    `${value.remaining} questions left · renews at midnight in Bangkok`;
  document
    .querySelectorAll('.scene-candle')
    .forEach((candle, index) => candle.classList.toggle('extinguished', index >= value.remaining));
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
function cardFigure(id: string, reversed: boolean) {
  const card = CARD_MAP.get(id)!;
  const figure = document.createElement('figure');
  figure.className = 'tarot-card';
  const image = document.createElement('img');
  image.src = card.image;
  image.alt = `${card.name}, ${reversed ? 'reversed' : 'upright'}`;
  image.draggable = false;
  image.classList.toggle('reversed', reversed);
  const caption = document.createElement('figcaption');
  caption.textContent = card.name;
  figure.append(image, caption);
  return figure;
}
function renderTable() {
  if (!reading) return;
  $('asked-question').textContent = reading.question;
  const signature =
    reading.cards.map((card) => `${card.id}:${card.reversed}`).join(',') + `:${stage === 'result'}`;
  if (signature !== renderedCards) {
    const previousCount = $('spread').querySelectorAll('.revealed').length;
    renderedCards = signature;
    $('spread').replaceChildren();
    for (let index = 0; index < 3; index++) {
      const slot = document.createElement('div');
      slot.className = 'card-slot';
      const card = reading.cards[index];
      if (card) {
        slot.classList.add('revealed');
        if (stage === 'drawing' && index >= previousCount) slot.classList.add('dealt');
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
  say(line.text, true, line.title);
  $('continue-reading').hidden = false;
  $('previous-line').hidden = lineIndex === 0;
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
    $('continue-reading').hidden = true;
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
        title: `${card.name}${reading!.cards[index].reversed ? ' · reversed' : ''}`,
        cardIndex: index,
      });
  });
  for (const text of splitDialogue(reading.answer.synthesis)) lines.push({ text });
  for (const text of splitDialogue(reading.answer.reflection)) lines.push({ text });
  renderTable();
  showLine();
  $('continue-reading').focus({ preventScroll: true });
}
async function acceptReading(value: ReadingView) {
  reading = value;
  clearError();
  if (value.status === 'complete') {
    await updateSession();
    showResult();
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
    setStage('pending');
    renderTable();
    say('Be still. Let me listen...');
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
    void client
      .read(reading.id)
      .then(acceptReading)
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
    setStage('entering');
    const video = $<HTMLVideoElement>('entrance-video');
    video.currentTime = 0;
    await video.play().catch(() => completeEntry());
    setTimeout(() => {
      if (stage === 'entering') void completeEntry();
    }, 11000);
  } catch (e) {
    showError(e);
  } finally {
    busy = false;
  }
}
async function completeEntry() {
  if (stage !== 'entering' && stage !== 'outside') return;
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
    sound.chime();
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
    busy = false;
    sound.chime(index + 1);
    orbPulse();
    await acceptReading(value);
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
$('sound').addEventListener(
  'click',
  () =>
    void sound
      .toggle()
      .then((on) => {
        $('sound').setAttribute('aria-pressed', String(on));
        $('sound').setAttribute('aria-label', `Turn ambient sound ${on ? 'off' : 'on'}`);
      })
      .catch(() => toast('Sound is unavailable in this browser.')),
);
$('fullscreen').addEventListener('click', () => {
  const action = document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen();
  void action.catch(() => toast('Fullscreen is unavailable here.'));
  menu.close();
});
$('about-privacy').addEventListener('click', () =>
  showInfo(
    '<h2>Inside the tent</h2><p>Three questions per browser, each day. Each accepted question extinguishes one candle. They return at midnight in Bangkok. Clearing cookies or changing browsers creates a separate visit.</p><p>A browser cookie remembers your allowance. Questions and readings remain available for up to 24 hours. Forgetting a reading deletes its content; the daily count remains. Scheduled cleanup removes expired content, with storage expiration as a fallback.</p><p>The live game uses AWS Bedrock, potentially outside Thailand. Avoid names, addresses, passwords and personal details. Question text is not written to operational logs.</p><p>The local demo uses sample readings and sends no question to AI unless Bedrock mode is explicitly configured.</p><p>For entertainment and reflection. The cards do not establish facts about the future or replace professional advice.</p>',
  ),
);
$('about-deck').addEventListener('click', () => {
  showInfo(
    '<h2>The Major Arcana</h2><p>22 cards. Three perspectives: the situation, the hidden influence, and the path ahead. Cards may be upright or reversed. Minor Arcana will arrive later.</p><p>Pixel Tarot Deck by <a href="https://chorline.itch.io/pixeltarotdeck" target="_blank" rel="noopener noreferrer">Chorline</a>, used unchanged. Interface font: VT323, under the SIL Open Font License.</p><p>Scene pixel effects adapted from <a href="https://collidingscopes.github.io/video-to-pixel-art/" target="_blank" rel="noopener noreferrer">Video-to-Pixel-Art</a> by Alan Ang / collidingScopes, under the <a href="/licenses/video-to-pixel-art-MIT.txt" target="_blank" rel="noopener noreferrer">MIT license</a>.</p><div id="deck-gallery"></div>',
  );
  $('deck-gallery').append(...CARDS.map((card) => cardFigure(card.id, false)));
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
  if (reduced.matches) finishTyping();
});
window.addEventListener('online', () => {
  if (stage !== 'outside' && stage !== 'entering') void reconnect();
});
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
