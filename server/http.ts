import { randomUUID } from 'node:crypto';
import { Game, GameError, safeEqual } from './game.js';
import { networkQuota } from './network-quota.js';

export type RequestData = {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: string;
  secure: boolean;
  // Set only by the transport adapter, never copied from browser-supplied data.
  clientIp?: string;
};
export type ResponseData = {
  status: number;
  headers: Record<string, string>;
  body: string;
  cookie?: string;
};
export const securityHeaders: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};
export function api(
  game: Game,
  origins: string[],
  onQueued?: (id: string) => void,
  networkSecret?: () => Promise<string>,
) {
  return async (request: RequestData): Promise<ResponseData> => {
    const headers = {
      ...securityHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Request-ID': randomUUID(),
      ...(request.secure ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
    };
    try {
      const network = async () =>
        networkSecret ? networkQuota(await networkSecret(), request.clientIp) : undefined;
      const name = request.secure ? '__Host-tarot_sid' : 'tarot_dev_sid';
      const token = (request.headers.cookie ?? '')
        .split(';')
        .map((x) => x.trim())
        .find((x) => x.startsWith(`${name}=`))
        ?.slice(name.length + 1);
      const mutation = ['POST', 'DELETE'].includes(request.method);
      if (mutation && !origins.includes(request.headers.origin ?? ''))
        throw new GameError(403, 'ORIGIN', 'This request must come from the tent.');
      if (Buffer.byteLength(request.body) > 4096)
        throw new GameError(413, 'BODY_SIZE', 'This request is too large.');
      const parse = () => {
        if (!request.headers['content-type']?.toLowerCase().startsWith('application/json'))
          throw new GameError(415, 'CONTENT_TYPE', 'Use a JSON request.');
        try {
          return JSON.parse(request.body || '{}') as unknown;
        } catch {
          throw new GameError(400, 'INVALID_JSON', 'This request could not be read.');
        }
      };
      if (request.path === '/api/session' && request.method === 'POST') {
        const body = parse();
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)
          throw new GameError(400, 'INVALID_REQUEST', 'Invalid session request.');
        const quota = await network();
        const result = await game.session(token);
        return {
          status: 200,
          headers,
          body: JSON.stringify(await game.sessionView(result.session, quota)),
          cookie: `${name}=${result.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor((result.session.expiresAt - game.clock()) / 1000))}${request.secure ? '; Secure' : ''}`,
        };
      }
      const session = await game.authenticate(token);
      if (mutation) {
        const csrf = request.headers['x-csrf-token'] ?? '';
        if (!/^[a-f0-9]{64}$/.test(csrf) || !safeEqual(csrf, session.csrf))
          throw new GameError(403, 'CSRF', 'This request has expired. Please reconnect.');
      }
      let result: unknown;
      if (request.path === '/api/session' && request.method === 'GET')
        result = await game.sessionView(session, await network());
      else if (request.path === '/api/readings' && request.method === 'POST')
        result = await game.submit(session, parse(), await network());
      else {
        const match = /^\/api\/readings\/([a-f0-9]{32})(\/draw)?$/.exec(request.path);
        if (!match) throw new GameError(404, 'NOT_FOUND', 'This path cannot be found.');
        if (match[2] && request.method === 'POST') {
          result = await game.draw(session, match[1], parse());
          if ((result as { status: string }).status === 'queued') onQueued?.(match[1]);
        } else if (!match[2] && request.method === 'GET')
          result = await game.read(session, match[1]);
        else if (!match[2] && request.method === 'DELETE') {
          await game.cancel(session, match[1]);
          result = { deleted: true };
        } else throw new GameError(405, 'METHOD', 'This action is not available.');
      }
      return { status: 200, headers, body: JSON.stringify(result) };
    } catch (error) {
      const known = error instanceof GameError;
      if (!known) console.error(JSON.stringify({ event: 'api_error', category: 'INTERNAL_ERROR' }));
      return {
        status: known ? error.status : 503,
        headers: {
          ...headers,
          ...(known && error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {}),
        },
        body: JSON.stringify({
          error: {
            code: known ? error.code : 'UNAVAILABLE',
            message: known ? error.message : 'The tent is quiet for a moment. Please try again.',
          },
        }),
      };
    }
  };
}
