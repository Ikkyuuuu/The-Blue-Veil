import { Game, GameError, type Content, type Reading } from './game.js';
import type { Generator } from './generator.js';

export async function processReading(game: Game, generator: Generator, id: string) {
  let reading: Reading | null = null;
  try {
    reading = await game.claim(id, generator.reserveMicros);
    if (!reading) return;
    const content = await game.store.get<Content>(`content#${id}`);
    if (!content || content.expiresAt <= game.clock()) {
      await game.finish(reading);
      return;
    }
    const answer = await generator.generate(content.question, reading);
    await game.finish(reading, answer);
  } catch (error) {
    if (error instanceof GameError && error.code === 'LEASE_BUSY') throw error;
    // A failed claim does not own a lease. Storage/network failures must never
    // release or finish another worker's in-flight generation.
    if (!reading) {
      if (!(error instanceof GameError) || !['CAPACITY', 'ATTEMPT_LIMIT'].includes(error.code))
        throw error;
      reading = (await game.store.get<Reading>(`reading#${id}`)) ?? null;
      if (reading && reading.leaseUntil > game.clock()) return;
    }
    if (!reading) return;
    const name = (error as { name?: string }).name;
    const transient = [
      'ThrottlingException',
      'ServiceUnavailableException',
      'InternalServerException',
      'TimeoutError',
      'AbortError',
    ].includes(name ?? '');
    if (transient && reading.attempts < 2) {
      await game.release(reading);
      throw error;
    }
    await game.finish(
      reading,
      undefined,
      error instanceof GameError && error.code === 'CAPACITY' ? error.message : undefined,
    );
    console.warn(
      JSON.stringify({
        event: 'reading_failed',
        category: error instanceof GameError ? error.code : 'SERVICE_FAILURE',
      }),
    );
  }
}

export async function cleanup(game: Game) {
  // TTL is an asynchronous fallback; scheduled cleanup also handles local state.
  for (const key of await game.store.due('NETWORK', game.clock(), 50)) {
    await game.store.transact([key], (tx) => {
      const counter = tx.get<{ expiresAt: number }>(key);
      if (counter && counter.expiresAt <= game.clock()) tx.delete(key);
    });
  }
  const keys = await game.store.due('CONTENT', game.clock(), 50);
  for (const key of keys) {
    const id = key.slice('content#'.length),
      r = `reading#${id}`,
      o = `outbox#${id}`;
    const reading = await game.store.get<Reading>(r);
    if (!reading) {
      await game.store.transact([key], (tx) => tx.delete(key));
      continue;
    }
    await game.store.transact([key, r, o], (tx) => {
      const content = tx.get<Content>(key),
        current = tx.get<Reading>(r);
      if (content && content.expiresAt <= game.clock()) {
        tx.delete(key);
        tx.delete(o);
        if (current)
          tx.put(
            r,
            { ...current, status: 'canceled', leaseId: undefined, networkQuota: undefined },
            current.createdAt + 7 * 86400000,
          );
      }
    });
  }
}
