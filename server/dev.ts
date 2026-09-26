import 'dotenv/config';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname, sep } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createServer as createViteServer } from 'vite';
import { MemoryStore } from './store.js';
import { DEFAULT_SETTINGS, Game } from './game.js';
import { api, securityHeaders } from './http.js';
import { BedrockGenerator, LocalGenerator } from './generator.js';
import { cleanup, processReading } from './worker.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 5173),
  origin = `http://localhost:${port}`;
const mode = process.env.READING_MODE === 'bedrock' ? 'bedrock' : 'local';
const store = new MemoryStore(
  resolve(root, process.env.LOCAL_STATE_FILE ?? '.private/dev-state.json'),
);
await store.load();
const game = new Game(store, { ...DEFAULT_SETTINGS, mode });
const generator =
  mode === 'bedrock'
    ? new BedrockGenerator({
        region: process.env.BEDROCK_REGION ?? 'us-east-1',
        model: process.env.BEDROCK_INFERENCE_PROFILE_ID ?? 'us.amazon.nova-micro-v1:0',
        guardrailId: process.env.BEDROCK_GUARDRAIL_ID ?? '',
        guardrailVersion: process.env.BEDROCK_GUARDRAIL_VERSION ?? '',
      })
    : new LocalGenerator();
const running = new Set<string>();
const enqueue = (id: string) => {
  if (running.has(id)) return;
  running.add(id);
  setTimeout(
    () => {
      void processReading(game, generator, id)
        .catch(() => undefined)
        .finally(() => running.delete(id));
    },
    mode === 'local' ? 1800 : 0,
  );
};
const handle = api(game, [origin, `http://127.0.0.1:${port}`], enqueue);
const production = process.argv.includes('--production');
const vite = production
  ? null
  : await createViteServer({
      root,
      server: { middlewareMode: true, host: '127.0.0.1', ws: { port: port + 10000 } },
      appType: 'spa',
    });
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.json': 'application/json',
};
const server = createServer(async (req, res) => {
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url ?? '/', origin).pathname).replaceAll('\\', '/');
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  if (path.startsWith('/api/')) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 4096) {
        res.writeHead(413, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({ error: { code: 'BODY_SIZE', message: 'This request is too large.' } }),
        );
        return;
      }
      chunks.push(Buffer.from(chunk));
    }
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(req.headers))
      headers[key] = Array.isArray(value) ? value.join('; ') : value;
    const result = await handle({
      method: req.method ?? 'GET',
      path,
      headers,
      body: Buffer.concat(chunks).toString('utf8'),
      secure: false,
    });
    res.writeHead(result.status, {
      ...result.headers,
      ...(result.cookie ? { 'Set-Cookie': result.cookie } : {}),
    });
    res.end(result.body);
    return;
  }
  // Local dev server binds only to loopback. It must never expose private files.
  const publicViteDependency =
    path.startsWith('/node_modules/.vite/') || path === '/node_modules/vite/dist/client/env.mjs';
  if (
    /(?:^|\/)(?:\.private|\.aws|\.ssh|\.git|\.env[^/]*|AWS_DISCOVERY\.md|SECURITY_PLAN\.md|artifacts|server|infra|node_modules)(?:\/|$)/i.test(
      path,
    ) &&
    !publicViteDependency
  ) {
    res.writeHead(404);
    res.end();
    return;
  }
  if (vite) {
    vite.middlewares(req, res, () => {
      res.writeHead(404);
      res.end();
    });
    return;
  }
  try {
    const base = resolve(root, 'dist');
    const file = resolve(base, `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(base + sep)) throw new Error('Invalid path');
    const content = await readFile(file);
    res.writeHead(200, {
      ...securityHeaders,
      'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
server.listen(port, '127.0.0.1', () =>
  console.info(
    `The Blue Veil: ${origin} (${mode === 'local' ? 'local sample readings' : 'Bedrock readings'})`,
  ),
);
const reconcile = setInterval(() => {
  void store
    .due('OUTBOX', Date.now())
    .then((keys) => keys.forEach((key) => enqueue(key.slice('outbox#'.length))));
  void cleanup(game);
}, 5000);
reconcile.unref();
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    clearInterval(reconcile);
    server.close();
    void vite?.close();
  });
