import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { MemoryStore } from '../server/store';
import {
  Game,
  DEFAULT_SETTINGS,
  dayKey,
  nextReset,
  type Reading,
  type Session,
} from '../server/game';
import { LocalGenerator, validateAnswer } from '../server/generator';
import { processReading, cleanup } from '../server/worker';
import { api } from '../server/http';
import { CARDS, DECK_VERSION } from '../shared/cards';

async function setup(settings = {}) {
  const store = new MemoryStore();
  let time = Date.parse('2026-09-26T08:00:00Z');
  const game = new Game(store, { ...DEFAULT_SETTINGS, ...settings }, () => time);
  const { session, token } = await game.session();
  return { game, store, session, token, setTime: (value: number) => (time = value) };
}
async function ready(game: Game, session: Session) {
  const result = await game.submit(session, {
    question: 'How can I approach this new chapter?',
    requestId: randomUUID(),
  });
  for (let i = 0; i < 3; i++)
    await game.draw(session, result.id, { expectedIndex: i, actionId: randomUUID() });
  return result.id;
}
describe('authoritative reading engine', () => {
  it('does not release another worker lease when claiming fails at the storage layer', async () => {
    const { game, session, store } = await setup();
    const id = await ready(game, session);
    const owner = await game.claim(id, 0);
    const failure = new Error('Storage unavailable');
    failure.name = 'ThrottlingException';
    vi.spyOn(game, 'claim').mockRejectedValueOnce(failure);
    await expect(processReading(game, new LocalGenerator(), id)).rejects.toBe(failure);
    const saved = await store.get<Reading>(`reading#${id}`);
    expect(saved?.status).toBe('working');
    expect(saved?.leaseId).toBe(owner?.leaseId);
    expect(saved?.attempts).toBe(1);
  });
  it('advertises the complete 78-card deck', async () => {
    const { game, session } = await setup();
    expect(CARDS).toHaveLength(78);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(78);
    expect((await game.sessionView(session)).deckSize).toBe(78);
    expect(CARDS.filter((c) => c.group === 'major')).toHaveLength(22);
    for (const group of ['wands', 'cups', 'swords', 'pentacles'])
      expect(CARDS.filter((c) => c.group === group)).toHaveLength(14);
  });
  it('keeps tokens and CSRF values out of persisted session records', async () => {
    const { store, session, token, game } = await setup();
    const saved = await store.get<Session>(`session#${session.id}`);
    expect(JSON.stringify(saved)).not.toContain(token);
    expect(saved?.csrf).toBe('');
    expect((await game.authenticate(token)).csrf).toBe(session.csrf);
  });
  it('accepts only one active question under concurrent different submissions', async () => {
    const { game, session } = await setup();
    const results = await Promise.allSettled(
      Array.from({ length: 100 }, () =>
        game.submit(session, { question: 'What should I reflect on?', requestId: randomUUID() }),
      ),
    );
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((await game.sessionView(session)).remaining).toBe(2);
  });
  it('charges duplicate acceptance only once and rejects changed input', async () => {
    const { game, session } = await setup();
    const body = { question: 'What can I learn?', requestId: randomUUID() };
    const results = await Promise.all(Array.from({ length: 30 }, () => game.submit(session, body)));
    expect(new Set(results.map((x) => x.id)).size).toBe(1);
    expect((await game.sessionView(session)).remaining).toBe(2);
    await expect(
      game.submit(session, { ...body, question: 'A different question?' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('hides unrevealed cards, chooses distinct cards and replays draw IDs safely', async () => {
    const { game, session, store } = await setup();
    const r = await game.submit(session, {
      question: 'Where should I focus?',
      requestId: randomUUID(),
    });
    expect(r.cards).toHaveLength(0);
    const stored = await store.get<Reading>(`reading#${r.id}`);
    expect(stored?.deckVersion).toBe(DECK_VERSION);
    expect(stored?.cards.every((drawn) => CARDS.some((card) => card.id === drawn.id))).toBe(true);
    expect(new Set(stored?.cards.map((x) => x.id)).size).toBe(3);
    const action = { expectedIndex: 0, actionId: randomUUID() };
    const [a, b] = await Promise.all([
      game.draw(session, r.id, action),
      game.draw(session, r.id, action),
    ]);
    expect(a.cards).toEqual(b.cards);
    expect(a.cards).toHaveLength(1);
    await expect(
      game.draw(session, r.id, { expectedIndex: 2, actionId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'DRAW_CONFLICT' });
    await expect(game.draw(session, r.id, { ...action, expectedIndex: 1 })).rejects.toMatchObject({
      code: 'DRAW_CONFLICT',
    });
  });
  it('serves the third reading, then refuses a fourth without calling a generator', async () => {
    const { game, session } = await setup();
    for (let i = 0; i < 3; i++) {
      const id = await ready(game, session);
      await processReading(game, new LocalGenerator(), id);
      expect((await game.read(session, id)).status).toBe('complete');
    }
    expect((await game.sessionView(session)).remaining).toBe(0);
    await expect(
      game.submit(session, { question: 'Another question?', requestId: randomUUID() }),
    ).rejects.toMatchObject({
      code: 'DAILY_LIMIT',
      message: 'You ask too much. Come back tomorrow.',
    });
  });
  it('isolates reading ownership across read, draw and delete', async () => {
    const { game, session } = await setup();
    const other = (await game.session()).session;
    const id = await ready(game, session);
    await expect(game.read(other, id)).rejects.toMatchObject({ status: 404 });
    await expect(
      game.draw(other, id, { expectedIndex: 0, actionId: randomUUID() }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(game.cancel(other, id)).rejects.toMatchObject({ status: 404 });
  });
  it('resets at Bangkok midnight and refunds the original date only once', async () => {
    const { game, session, setTime } = await setup();
    setTime(Date.parse('2026-09-26T16:59:59Z'));
    const id = await ready(game, session);
    const claim = await game.claim(id, 100);
    setTime(Date.parse('2026-09-26T17:00:01Z'));
    expect(dayKey(game.clock())).toBe('2026-09-27');
    expect((await game.sessionView(session)).remaining).toBe(3);
    await Promise.all([game.finish(claim!), game.finish(claim!)]);
    expect((await game.sessionView(session)).remaining).toBe(3);
    expect(await game.store.get(`quota#${session.id}#2026-09-26`)).toEqual({ count: 0 });
    expect(nextReset(Date.parse('2026-09-26T16:59:59Z'))).toBe(Date.parse('2026-09-26T17:00:00Z'));
  });
  it('preserves idempotency and the chosen cards across midnight', async () => {
    const { game, session, setTime, store } = await setup();
    setTime(Date.parse('2026-09-26T16:59:59Z'));
    const body = { question: 'What can I learn?', requestId: randomUUID() };
    const first = await game.submit(session, body);
    const original = await store.get<Reading>(`reading#${first.id}`);
    setTime(Date.parse('2026-09-26T17:00:01Z'));
    expect((await game.submit(session, body)).id).toBe(first.id);
    expect((await store.get<Reading>(`reading#${first.id}`))?.cards).toEqual(original?.cards);
    expect((await game.sessionView(session)).remaining).toBe(3);
  });
  it('does not regenerate after successful duplicate queue delivery', async () => {
    const { game, session } = await setup();
    const id = await ready(game, session);
    let calls = 0;
    const generator = {
      reserveMicros: 10,
      generate: async (q: string, r: Reading) => {
        calls++;
        return new LocalGenerator().generate(q, r);
      },
    };
    await processReading(game, generator, id);
    await processReading(game, generator, id);
    expect(calls).toBe(1);
  });
  it('prevents a canceled reading from being restored by an in-flight result', async () => {
    const { game, session, store } = await setup();
    const id = await ready(game, session);
    const claim = await game.claim(id, 100);
    await game.cancel(session, id);
    await game.finish(claim!, await new LocalGenerator().generate('A question?', claim!));
    expect(await store.get(`content#${id}`)).toBeUndefined();
    await expect(game.read(session, id)).rejects.toMatchObject({ status: 410 });
    expect((await game.sessionView(session)).remaining).toBe(2);
  });
  it('uses logical expiry even before physical TTL removal', async () => {
    const { game, session, setTime, store } = await setup();
    const id = await ready(game, session);
    setTime(game.clock() + 86400001);
    expect(await store.get(`content#${id}`)).toBeDefined();
    await expect(game.read(session, id)).rejects.toMatchObject({ status: 410 });
    await cleanup(game);
    expect(await store.get(`content#${id}`)).toBeUndefined();
  });
  it('fails closed when global spending is exhausted and refunds once', async () => {
    const { game, session } = await setup({ aiBudgetMicros: 50 });
    const id = await ready(game, session);
    let calls = 0;
    await processReading(
      game,
      {
        reserveMicros: 100,
        generate: async () => {
          calls++;
          throw new Error('must not call');
        },
      },
      id,
    );
    expect(calls).toBe(0);
    expect((await game.read(session, id)).status).toBe('failed');
    expect((await game.sessionView(session)).remaining).toBe(3);
  });
  it('caps paid retries despite repeated deliveries', async () => {
    const { game, session } = await setup();
    const id = await ready(game, session);
    let calls = 0;
    const generator = {
      reserveMicros: 100,
      generate: async () => {
        calls++;
        const error = new Error('transient');
        error.name = 'ThrottlingException';
        throw error;
      },
    };
    await expect(processReading(game, generator, id)).rejects.toMatchObject({
      name: 'ThrottlingException',
    });
    await processReading(game, generator, id);
    await processReading(game, generator, id);
    expect(calls).toBe(2);
    expect((await game.sessionView(session)).remaining).toBe(3);
  });
  it('rejects extra fields, empty questions, large bodies and forged card input', async () => {
    const { game, session } = await setup();
    for (const body of [
      { question: ' ', requestId: randomUUID() },
      { question: 'x'.repeat(501), requestId: randomUUID() },
      { question: 'A question?', requestId: randomUUID(), cards: ['the-sun'] },
      { question: 'A question?', requestId: 'bad' },
    ])
      await expect(game.submit(session, body)).rejects.toMatchObject({ status: 400 });
    expect((await game.sessionView(session)).remaining).toBe(3);
  });
  it('rejects answers that substitute cards or add unsafe structure', async () => {
    const { game, session, store } = await setup();
    const id = await ready(game, session);
    const r = (await store.get<Reading>(`reading#${id}`))!;
    const answer = await new LocalGenerator().generate('A question?', r);
    answer.cards[0].cardId = 'not-drawn';
    expect(() => validateAnswer(answer, r)).toThrow();
    expect(() => validateAnswer({ ...answer, html: '<script>alert(1)</script>' }, r)).toThrow();
  });
});
describe('HTTP boundary', () => {
  it('requires same-origin bootstrap, secure cookies, CSRF and no-store', async () => {
    const { game } = await setup();
    const handle = api(game, ['https://game.example']);
    const base = {
      method: 'POST',
      path: '/api/session',
      headers: { origin: 'https://game.example', 'content-type': 'application/json' },
      body: '{}',
      secure: true,
    };
    expect(
      (await handle({ ...base, headers: { ...base.headers, origin: 'https://evil.example' } }))
        .status,
    ).toBe(403);
    const boot = await handle(base);
    expect(boot.status).toBe(200);
    expect(boot.cookie).toMatch(/^__Host-tarot_sid=/);
    expect(boot.cookie).toContain('HttpOnly');
    expect(boot.cookie).toContain('; Secure');
    expect(boot.headers['Cache-Control']).toBe('no-store');
    const body = JSON.stringify({ question: 'What should I consider?', requestId: randomUUID() });
    const headers = { ...base.headers, cookie: boot.cookie!.split(';')[0] };
    expect((await handle({ ...base, path: '/api/readings', body, headers })).status).toBe(403);
    const csrf = JSON.parse(boot.body).csrf;
    expect(
      (
        await handle({
          ...base,
          path: '/api/readings',
          body,
          headers: { ...headers, 'x-csrf-token': csrf },
        })
      ).status,
    ).toBe(200);
  });
});
