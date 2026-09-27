import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  CARDS,
  DECK_VERSION,
  type DrawnCard,
  type Interpretation,
  type ReadingView,
  type SessionView,
} from '../shared/cards.js';
import type { Store, Transaction } from './store.js';
import type { NetworkQuota } from './network-quota.js';

const DAY = 86400000;
const SESSION_LIFE = 30 * DAY;
const RECORD_LIFE = 7 * DAY;
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
export const dayKey = (now: number) => new Date(now + 7 * 3600000).toISOString().slice(0, 10);
export const monthKey = (now: number) => new Date(now).toISOString().slice(0, 7);
export const nextReset = (now: number) => Date.parse(`${dayKey(now)}T00:00:00+07:00`) + DAY;
export class GameError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export type Session = {
  id: string;
  csrf: string;
  expiresAt: number;
  active: string | null;
  latest: string | null;
};
export type Reading = {
  id: string;
  owner: string;
  questionHash: string;
  day: string;
  cards: DrawnCard[];
  revealed: number;
  actions: string[];
  status: ReadingView['status'];
  createdAt: number;
  expiresAt: number;
  refunded: boolean;
  attempts: number;
  leaseUntil: number;
  leaseId?: string;
  message?: string;
  deckVersion: string;
  networkQuota?: { key: string; expiresAt: number };
};
export type Content = { question: string; answer?: Interpretation; expiresAt: number };
export type Job = { id: string; status: 'pending' | 'done'; createdAt: number };
type Counter = { count: number };
type NetworkCounter = Counter & { expiresAt: number };
type Limit = { count: number; microDollars: number };
export type Settings = {
  dailyLimit: number;
  monthlyLimit: number;
  aiBudgetMicros: number;
  generationEnabled: boolean;
  mode: 'local' | 'bedrock';
};
export const DEFAULT_SETTINGS: Settings = {
  dailyLimit: 100,
  monthlyLimit: 2000,
  aiBudgetMicros: 2_000_000,
  generationEnabled: true,
  mode: 'local',
};
export const SubmitSchema = z
  .object({
    question: z
      .string()
      .trim()
      .min(3)
      .refine(
        (x) =>
          Array.from(x).length <= 500 &&
          Buffer.byteLength(x) <= 2000 &&
          !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(x),
      ),
    requestId: z.uuid(),
  })
  .strict();
export const DrawSchema = z
  .object({ expectedIndex: z.number().int().min(0).max(2), actionId: z.uuid() })
  .strict();
export class Game {
  constructor(
    public store: Store,
    public settings: Settings = DEFAULT_SETTINGS,
    public clock: () => number = Date.now,
  ) {}
  async session(token?: string): Promise<{ token: string; session: Session }> {
    const now = this.clock();
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const current = await this.store.get<Session>(`session#${hash(token)}`);
      if (current && current.expiresAt > now)
        return { token, session: { ...current, csrf: hash(`csrf:${token}`) } };
    }
    const raw = randomBytes(32).toString('hex');
    const session: Session = {
      id: hash(raw),
      csrf: '',
      expiresAt: now + SESSION_LIFE,
      active: null,
      latest: null,
    };
    await this.store.transact([`session#${session.id}`], (tx) =>
      tx.put(`session#${session.id}`, session, session.expiresAt),
    );
    return { token: raw, session: { ...session, csrf: hash(`csrf:${raw}`) } };
  }
  async authenticate(token?: string): Promise<Session> {
    const session =
      token && /^[a-f0-9]{64}$/.test(token)
        ? await this.store.get<Session>(`session#${hash(token)}`)
        : undefined;
    if (!session || session.expiresAt <= this.clock())
      throw new GameError(
        401,
        'SESSION_EXPIRED',
        'Your visit has faded. Please enter the tent again.',
      );
    return { ...session, csrf: hash(`csrf:${token}`) };
  }
  async sessionView(session: Session, network?: NetworkQuota): Promise<SessionView> {
    const now = this.clock();
    const current = (await this.store.get<Session>(`session#${session.id}`)) ?? session;
    const used = await this.store.get<Counter>(`quota#${session.id}#${dayKey(now)}`);
    const networkUsed = network
      ? await this.store.get<NetworkCounter>(network(dayKey(now)))
      : undefined;
    const active = current.active
      ? await this.store.get<Reading>(`reading#${current.active}`)
      : undefined;
    const latest = current.latest
      ? await this.store.get<Reading>(`reading#${current.latest}`)
      : undefined;
    return {
      csrf: session.csrf,
      remaining: Math.max(
        0,
        3 -
          Math.max(
            used?.count ?? 0,
            networkUsed && networkUsed.expiresAt > now ? networkUsed.count : 0,
          ),
      ),
      resetsAt: nextReset(now),
      activeReading:
        active &&
        active.expiresAt > now &&
        !['complete', 'failed', 'canceled'].includes(active.status)
          ? active.id
          : null,
      latestReading:
        latest && latest.expiresAt > now && latest.status !== 'canceled' ? latest.id : null,
      mode: this.settings.mode,
      deckSize: CARDS.length,
    };
  }
  private liveSession(tx: Transaction, session: Session) {
    const current = tx.get<Session>(`session#${session.id}`);
    if (!current || current.expiresAt <= this.clock())
      throw new GameError(401, 'SESSION_EXPIRED', 'Please enter the tent again.');
    return current;
  }
  async submit(session: Session, body: unknown, network?: NetworkQuota): Promise<ReadingView> {
    const parsed = SubmitSchema.safeParse(body);
    if (!parsed.success)
      throw new GameError(400, 'INVALID_QUESTION', 'Ask a question between 3 and 500 characters.');
    const { question, requestId } = parsed.data;
    const now = this.clock(),
      day = dayKey(now),
      month = monthKey(now);
    const id = hash(`${session.id}:${requestId}`).slice(0, 32),
      s = `session#${session.id}`,
      r = `reading#${id}`,
      q = `quota#${session.id}#${day}`,
      c = `content#${id}`,
      gd = `accepted-day#${day}`,
      gm = `accepted-month#${month}`;
    const networkKey = network?.(day);
    const pool = [...CARDS];
    const cards: DrawnCard[] = Array.from({ length: 3 }, () => ({
      id: pool.splice(randomInt(pool.length), 1)[0].id,
      reversed: randomInt(2) === 1,
    }));
    const oldActive = (await this.store.get<Session>(s))?.active;
    const oldKey = oldActive ? `reading#${oldActive}` : undefined;
    await this.store.transact(
      [s, r, q, c, gd, gm, ...(oldKey ? [oldKey] : []), ...(networkKey ? [networkKey] : [])],
      (tx) => {
        const current = this.liveSession(tx, session);
        const existing = tx.get<Reading>(r);
        if (existing) {
          if (existing.questionHash !== hash(question))
            throw new GameError(
              409,
              'IDEMPOTENCY_CONFLICT',
              'This request already belongs to another question.',
            );
          if (existing.expiresAt <= now || existing.status === 'canceled')
            throw new GameError(410, 'READING_EXPIRED', 'That reading has left the tent.');
          return;
        }
        if (current.active && current.active !== oldActive)
          throw new GameError(
            409,
            'ACTIVE_READING',
            'Finish or release your current reading first.',
          );
        const active = oldKey ? tx.get<Reading>(oldKey) : undefined;
        if (
          active &&
          active.expiresAt > now &&
          !['complete', 'failed', 'canceled'].includes(active.status)
        )
          throw new GameError(
            409,
            'ACTIVE_READING',
            'Finish or release your current reading first.',
          );
        const used = tx.get<Counter>(q)?.count ?? 0;
        const networkCounter = networkKey ? tx.get<NetworkCounter>(networkKey) : undefined;
        const networkUsed =
          networkCounter && networkCounter.expiresAt > now ? networkCounter.count : 0;
        if (used >= 3 || networkUsed >= 3)
          throw new GameError(
            429,
            'DAILY_LIMIT',
            'You ask too much. Come back tomorrow.',
            Math.ceil((nextReset(now) - now) / 1000),
          );
        const globalDay = tx.get<Counter>(gd)?.count ?? 0,
          globalMonth = tx.get<Counter>(gm)?.count ?? 0;
        if (
          !this.settings.generationEnabled ||
          globalDay >= this.settings.dailyLimit ||
          globalMonth >= this.settings.monthlyLimit
        )
          throw new GameError(
            503,
            'CAPACITY',
            'The veil is quiet for now. Please return another time.',
          );
        const reading: Reading = {
          id,
          owner: session.id,
          questionHash: hash(question),
          day,
          cards,
          revealed: 0,
          actions: [],
          status: 'drawing',
          createdAt: now,
          expiresAt: now + DAY,
          refunded: false,
          attempts: 0,
          leaseUntil: 0,
          deckVersion: DECK_VERSION,
          ...(networkKey
            ? { networkQuota: { key: networkKey, expiresAt: nextReset(now) + DAY } }
            : {}),
        };
        tx.put(s, { ...current, active: id, latest: id }, current.expiresAt);
        tx.put(q, { count: used + 1 }, now + RECORD_LIFE);
        if (reading.networkQuota)
          tx.put(
            reading.networkQuota.key,
            { count: networkUsed + 1, expiresAt: reading.networkQuota.expiresAt },
            reading.networkQuota.expiresAt,
            'NETWORK',
            reading.networkQuota.expiresAt,
          );
        tx.put(gd, { count: globalDay + 1 }, now + RECORD_LIFE);
        tx.put(gm, { count: globalMonth + 1 }, now + 62 * DAY);
        tx.put(r, reading, now + RECORD_LIFE);
        tx.put(c, { question, expiresAt: now + DAY }, now + DAY, 'CONTENT', now + DAY);
      },
    );
    return this.read(session, id);
  }
  async read(session: Session, id: string): Promise<ReadingView> {
    const reading = await this.store.get<Reading>(`reading#${id}`);
    if (!reading || reading.owner !== session.id)
      throw new GameError(404, 'NOT_FOUND', 'That reading cannot be found.');
    if (reading.expiresAt <= this.clock() || reading.status === 'canceled')
      throw new GameError(410, 'READING_EXPIRED', 'That reading has left the tent.');
    const content = await this.store.get<Content>(`content#${id}`);
    if (!content || content.expiresAt <= this.clock())
      throw new GameError(410, 'READING_EXPIRED', 'That reading has left the tent.');
    return {
      id,
      question: content.question,
      status: reading.status,
      cards: reading.cards.slice(0, reading.revealed),
      createdAt: reading.createdAt,
      expiresAt: reading.expiresAt,
      ...(reading.status === 'complete' ? { answer: content.answer } : {}),
      ...(reading.message ? { message: reading.message } : {}),
    };
  }
  async draw(session: Session, id: string, body: unknown) {
    const parsed = DrawSchema.safeParse(body);
    if (!parsed.success)
      throw new GameError(400, 'INVALID_DRAW', 'Choose the next card in your spread.');
    const { expectedIndex, actionId } = parsed.data,
      now = this.clock(),
      r = `reading#${id}`,
      o = `outbox#${id}`;
    await this.store.transact([r, o, `session#${session.id}`], (tx) => {
      this.liveSession(tx, session);
      const reading = tx.get<Reading>(r);
      if (!reading || reading.owner !== session.id)
        throw new GameError(404, 'NOT_FOUND', 'That reading cannot be found.');
      if (reading.expiresAt <= now || reading.status === 'canceled')
        throw new GameError(410, 'READING_EXPIRED', 'That reading has left the tent.');
      const previous = reading.actions.indexOf(actionId);
      if (previous >= 0) {
        if (previous !== expectedIndex)
          throw new GameError(
            409,
            'DRAW_CONFLICT',
            'That action already revealed a different card.',
          );
        return;
      }
      if (reading.status !== 'drawing' || reading.revealed !== expectedIndex)
        throw new GameError(
          409,
          'DRAW_CONFLICT',
          'The cards have already moved. Reconnect to your reading.',
        );
      reading.actions.push(actionId);
      reading.revealed++;
      if (reading.revealed === 3) {
        reading.status = 'queued';
        tx.put(
          o,
          { id, status: 'pending', createdAt: now } satisfies Job,
          now + RECORD_LIFE,
          'OUTBOX',
          now,
        );
      }
      tx.put(r, reading, reading.createdAt + RECORD_LIFE);
    });
    return this.read(session, id);
  }
  async cancel(session: Session, id: string) {
    const r = `reading#${id}`,
      c = `content#${id}`,
      s = `session#${session.id}`,
      o = `outbox#${id}`;
    await this.store.transact([r, c, s, o], (tx) => {
      const current = this.liveSession(tx, session),
        reading = tx.get<Reading>(r);
      if (!reading || reading.owner !== session.id)
        throw new GameError(404, 'NOT_FOUND', 'That reading cannot be found.');
      tx.put(
        r,
        { ...reading, status: 'canceled', leaseId: undefined, networkQuota: undefined },
        reading.createdAt + RECORD_LIFE,
      );
      tx.delete(c);
      tx.delete(o);
      tx.put(
        s,
        {
          ...current,
          active: current.active === id ? null : current.active,
          latest: current.latest === id ? null : current.latest,
        },
        current.expiresAt,
      );
    });
  }
  async claim(id: string, reserveMicros: number) {
    const now = this.clock(),
      r = `reading#${id}`,
      d = `attempt-day#${dayKey(now)}`,
      m = `spend-month#${monthKey(now)}`;
    return this.store.transact([r, d, m, 'control#generation'], (tx) => {
      const reading = tx.get<Reading>(r);
      if (!reading || reading.expiresAt <= now || !['queued', 'working'].includes(reading.status))
        return null;
      if (reading.leaseUntil > now) throw new GameError(409, 'LEASE_BUSY', 'Reading in progress.');
      if (reading.attempts >= 2)
        throw new GameError(
          503,
          'ATTEMPT_LIMIT',
          'The vision did not settle. Your question has been restored.',
        );
      if (
        !this.settings.generationEnabled ||
        tx.get<{ enabled: boolean }>('control#generation')?.enabled === false
      )
        throw new GameError(
          503,
          'CAPACITY',
          'The veil is resting. Your question has been restored.',
        );
      const daily = tx.get<Limit>(d) ?? { count: 0, microDollars: 0 },
        monthly = tx.get<Limit>(m) ?? { count: 0, microDollars: 0 };
      if (
        daily.count >= this.settings.dailyLimit * 2 ||
        monthly.count >= this.settings.monthlyLimit * 2 ||
        monthly.microDollars + reserveMicros > this.settings.aiBudgetMicros
      )
        throw new GameError(
          503,
          'CAPACITY',
          'The veil is resting. Your question has been restored.',
        );
      reading.status = 'working';
      reading.attempts++;
      reading.leaseUntil = now + 60000;
      reading.leaseId = randomUUID();
      tx.put(r, reading, reading.createdAt + RECORD_LIFE);
      tx.put(
        d,
        { count: daily.count + 1, microDollars: daily.microDollars + reserveMicros },
        now + RECORD_LIFE,
      );
      tx.put(
        m,
        { count: monthly.count + 1, microDollars: monthly.microDollars + reserveMicros },
        now + 62 * DAY,
      );
      return reading;
    });
  }
  async finish(reading: Reading, answer?: Interpretation, message?: string) {
    const r = `reading#${reading.id}`,
      c = `content#${reading.id}`,
      s = `session#${reading.owner}`,
      q = `quota#${reading.owner}#${reading.day}`,
      o = `outbox#${reading.id}`;
    const network = reading.networkQuota;
    await this.store.transact([r, c, s, q, o, ...(network ? [network.key] : [])], (tx) => {
      const current = tx.get<Reading>(r),
        content = tx.get<Content>(c),
        session = tx.get<Session>(s);
      if (
        !current ||
        ['complete', 'canceled', 'failed'].includes(current.status) ||
        current.leaseId !== reading.leaseId
      )
        return;
      const complete = !!answer && !!content && content.expiresAt > this.clock();
      if (complete)
        tx.put(c, { ...content, answer }, content.expiresAt, 'CONTENT', content.expiresAt);
      if (!complete && !current.refunded) {
        const count = tx.get<Counter>(q)?.count ?? 0;
        tx.put(q, { count: Math.max(0, count - 1) }, current.createdAt + RECORD_LIFE);
        current.refunded = true;
        // Refund the original network, without recreating expired counters.
        if (network && current.networkQuota?.key === network.key) {
          const counter = tx.get<NetworkCounter>(network.key);
          if (counter && counter.expiresAt > this.clock())
            tx.put(
              network.key,
              { ...counter, count: Math.max(0, counter.count - 1) },
              counter.expiresAt,
              'NETWORK',
              counter.expiresAt,
            );
        }
      }
      delete current.networkQuota;
      current.status = complete ? 'complete' : 'failed';
      current.message = complete
        ? undefined
        : (message ?? 'The vision did not settle. Your question has been restored.');
      current.leaseUntil = 0;
      tx.put(r, current, current.createdAt + RECORD_LIFE);
      if (session)
        tx.put(
          s,
          { ...session, active: session.active === reading.id ? null : session.active },
          session.expiresAt,
        );
      tx.delete(o);
    });
  }
  async release(reading: Reading) {
    await this.store.transact([`reading#${reading.id}`], (tx) => {
      const current = tx.get<Reading>(`reading#${reading.id}`);
      if (current?.status === 'working' && current.leaseId === reading.leaseId)
        tx.put(
          `reading#${reading.id}`,
          { ...current, status: 'queued', leaseUntil: 0, leaseId: undefined },
          current.createdAt + RECORD_LIFE,
        );
    });
  }
}
