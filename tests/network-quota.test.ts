import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { networkAddress, networkQuota, NETWORK_HEADER } from '../server/network-quota';
import { localNetworkSecret } from '../server/network-secret';
import { Game, DEFAULT_SETTINGS, dayKey, nextReset, type Reading } from '../server/game';
import { MemoryStore } from '../server/store';
import { api, type RequestData } from '../server/http';
import { cleanup } from '../server/worker';
import { VIEWER_NETWORK_CODE } from '../infra/viewer-network';

const secret = 'SyntheticNetworkKeyForTests'.padEnd(64, 'x');
const address = '192.0.2.12';
const network = networkQuota(secret, address);
const question = () => ({ question: 'What can I learn?', requestId: randomUUID() });
function setup() {
  let now = Date.parse('2026-09-27T12:00:00Z');
  const store = new MemoryStore();
  const game = new Game(store, DEFAULT_SETTINGS, () => now);
  return {
    game,
    store,
    setTime: (time: number) => {
      now = time;
    },
  };
}

describe('anonymous network abuse allowance', () => {
  it('canonicalizes IPv4/mapped IPv4 and groups temporary IPv6 addresses by /64', () => {
    expect(networkAddress('::ffff:192.0.2.12')).toBe(networkAddress(address));
    expect(networkAddress('::FFFF:c000:020c')).toBe(networkAddress(address));
    const a = networkQuota(secret, '2001:db8:ab:cd::1');
    const b = networkQuota(secret, '2001:0DB8:00ab:00cd:1234:abcd:ef12:9876');
    expect(a('2026-09-27')).toBe(b('2026-09-27'));
    expect(a('2026-09-27')).not.toBe(networkQuota(secret, '2001:db8:ab:ce::1')('2026-09-27'));
    expect(network('2026-09-27')).not.toBe(network('2026-09-28'));
    expect(network('2026-09-27')).not.toContain(address);
    expect(network('2026-09-27')).not.toBe(networkQuota('y'.repeat(64), address)('2026-09-27'));
  });

  it.each([
    undefined,
    '',
    'garbage',
    '192.0.2.12, 192.0.2.13',
    '192.0.2.12:80',
    '[::1]',
    'fe80::1%eth0',
    ' 192.0.2.12',
  ])('rejects invalid transport addresses: %s', (value) => {
    expect(() => networkQuota(secret, value)).toThrow('network address');
  });

  it('replaces a forged edge header including duplicate values with the actual viewer', () => {
    const handler = runInNewContext(`${VIEWER_NETWORK_CODE}; handler`);
    const result = handler({
      viewer: { ip: address },
      request: {
        headers: {
          [NETWORK_HEADER]: { value: '192.0.2.99', multiValue: [{ value: '192.0.2.98' }] },
          'x-forwarded-for': { value: '192.0.2.97' },
        },
      },
    });
    expect(result.headers[NETWORK_HEADER]).toEqual({ value: address });
  });

  it('allows only three concurrent sessions on one network without sharing readings', async () => {
    const { game, store } = setup();
    const sessions = await Promise.all(Array.from({ length: 20 }, () => game.session()));
    const results = await Promise.allSettled(
      sessions.map(({ session }) => game.submit(session, question(), network)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    for (const result of results.filter((r) => r.status === 'rejected'))
      expect(result.reason).toMatchObject({ status: 429, code: 'DAILY_LIMIT' });
    const fresh = (await game.session()).session;
    expect((await game.sessionView(fresh, network)).remaining).toBe(0);
    const accepted = results.find((r) => r.status === 'fulfilled')!;
    if (accepted.status !== 'fulfilled') throw new Error('Expected reading');
    await expect(game.read(fresh, accepted.value.id)).rejects.toMatchObject({ status: 404 });
    expect(accepted.value).not.toHaveProperty('networkQuota');
    expect(await store.get(`accepted-day#${dayKey(game.clock())}`)).toEqual({ count: 3 });
    const row = await store.get<{ count: number; expiresAt: number }>(
      network(dayKey(game.clock())),
    );
    expect(row).toEqual({ count: 3, expiresAt: nextReset(game.clock()) + 86400000 });
    expect(JSON.stringify(row)).not.toContain(address);
    expect(JSON.stringify(row)).not.toContain(secret);
  });

  it('charges retries once, rejects invalid input for free, and does not refund cancellation', async () => {
    const { game, store } = setup();
    const { session } = await game.session();
    await expect(
      game.submit(session, { ...question(), question: '' }, network),
    ).rejects.toMatchObject({ code: 'INVALID_QUESTION' });
    expect((await game.sessionView(session, network)).remaining).toBe(3);
    const body = question();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => game.submit(session, body, network)),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect((await game.sessionView(session, network)).remaining).toBe(2);
    await expect(
      game.submit(session, { ...body, question: 'Something else?' }, network),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await game.cancel(session, results[0].id);
    expect((await game.sessionView(session, network)).remaining).toBe(2);
    expect((await store.get<Reading>(`reading#${results[0].id}`))?.networkQuota).toBeUndefined();
  });

  it('keeps the browser quota across network changes and resets at Bangkok midnight', async () => {
    const { game, setTime } = setup();
    const { session } = await game.session();
    for (let i = 0; i < 3; i++) {
      const value = await game.submit(session, question(), network);
      await game.cancel(session, value.id);
    }
    const otherNetwork = networkQuota(secret, '192.0.2.13');
    expect((await game.sessionView(session, otherNetwork)).remaining).toBe(0);
    const newSession = (await game.session()).session;
    expect((await game.sessionView(newSession, otherNetwork)).remaining).toBe(3);
    await expect(game.submit(newSession, question(), network)).rejects.toMatchObject({
      code: 'DAILY_LIMIT',
    });
    setTime(Date.parse('2026-09-27T17:00:00Z'));
    expect((await game.sessionView(newSession, network)).remaining).toBe(3);
    expect((await game.sessionView(session, network)).remaining).toBe(3);
  });

  it('refunds a failed reading to its original network exactly once, including after midnight', async () => {
    const { game, store, setTime } = setup();
    const { session } = await game.session();
    const r = await game.submit(session, question(), network);
    for (let i = 0; i < 3; i++)
      await game.draw(session, r.id, { expectedIndex: i, actionId: randomUUID() });
    const claimed = (await game.claim(r.id, 0))!;
    const key = network(dayKey(game.clock()));
    setTime(nextReset(game.clock()) + 1000);
    await Promise.all([game.finish(claimed), game.finish(claimed)]);
    expect((await store.get<{ count: number }>(key))?.count).toBe(0);
    expect((await store.get<Reading>(`reading#${r.id}`))?.networkQuota).toBeUndefined();
    expect(await store.get(network(dayKey(game.clock())))).toBeUndefined();
  });

  it('cleans expired counters and abandoned links without relying on timely DynamoDB TTL deletion', async () => {
    const { game, store, setTime } = setup();
    const { session } = await game.session();
    const r = await game.submit(session, question(), network);
    const key = network(dayKey(game.clock()));
    setTime(nextReset(game.clock()) + 86400000);
    await cleanup(game);
    expect(await store.get(key)).toBeUndefined();
    expect((await store.get<Reading>(`reading#${r.id}`))?.networkQuota).toBeUndefined();
  });

  it('uses only the transport address at the HTTP boundary and fails closed without it or the key', async () => {
    const { game } = setup();
    const origin = 'https://game.example';
    const handle = api(game, [origin], undefined, async () => secret);
    const request: RequestData = {
      method: 'POST',
      path: '/api/session',
      secure: true,
      body: '{}',
      clientIp: address,
      headers: { origin, 'content-type': 'application/json' },
    };
    for (let i = 0; i < 4; i++) {
      const headers = {
        ...request.headers,
        [NETWORK_HEADER]: `192.0.2.${80 + i}`,
        'x-forwarded-for': `192.0.2.${90 + i}`,
      };
      const bootstrap = await handle({ ...request, headers });
      const session = JSON.parse(bootstrap.body);
      expect(session.remaining).toBe(3 - Math.min(i, 3));
      const result = await handle({
        ...request,
        path: '/api/readings',
        body: JSON.stringify(question()),
        headers: {
          ...headers,
          cookie: bootstrap.cookie!.split(';')[0],
          'x-csrf-token': session.csrf,
        },
      });
      expect(result.status).toBe(i < 3 ? 200 : 429);
      expect(result.body).not.toContain('network-quota');
      expect(result.body).not.toContain(address);
    }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(
        (
          await handle({
            ...request,
            clientIp: undefined,
            headers: { ...request.headers, [NETWORK_HEADER]: address },
          })
        ).status,
      ).toBe(503);
      const broken = api(game, [origin], undefined, async () => {
        throw new Error('Secret unavailable');
      });
      expect((await broken(request)).status).toBe(503);
      expect((await api(game, [origin], undefined, async () => 'bad')(request)).status).toBe(503);
      expect(JSON.stringify(log.mock.calls)).not.toContain(address);
      expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
    } finally {
      log.mockRestore();
    }
  });

  it('retains a local key over server restarts and rejects a corrupt key without replacing it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'blue-veil-network-'));
    const file = join(directory, 'state.network-key');
    try {
      const key = await localNetworkSecret(file);
      expect(await localNetworkSecret(file)).toBe(key);
      expect(await readFile(file, 'utf8')).toBe(key);
      await writeFile(file, 'corrupt');
      await expect(localNetworkSecret(file)).rejects.toThrow('Invalid network quota secret');
      expect(await readFile(file, 'utf8')).toBe('corrupt');
    } finally {
      await unlink(file);
      await rmdir(directory);
    }
  });
});
