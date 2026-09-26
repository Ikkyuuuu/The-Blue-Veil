import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('build/lambda', { recursive: true });
await build({
  entryPoints: ['server/lambda.ts'],
  outdir: 'build/lambda',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outExtension: { '.js': '.cjs' },
  sourcemap: false,
  minify: true,
});
