import { spawnSync } from 'node:child_process';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const run = (args, input) =>
  spawnSync('git', args, { cwd: process.cwd(), encoding: 'utf8', input, windowsHide: true });
const repo = run(['rev-parse', '--show-toplevel']);
let prefix = [];
if (repo.status !== 0) {
  const dir = resolve('.private/gitignore-validation.git');
  await mkdir(dir, { recursive: true });
  if (run(['init', '--bare', '--quiet', dir]).status !== 0)
    throw new Error('Git validation setup failed.');
  prefix = [`--git-dir=${dir}`, `--work-tree=${process.cwd()}`, '-c', 'core.bare=false'];
} else if (resolve(repo.stdout.trim()) !== process.cwd())
  throw new Error('Run the public check from the repository root.');
const result = run([...prefix, 'ls-files', '--cached', '--others', '--exclude-standard', '-z']);
if (result.status !== 0) throw new Error('Cannot enumerate publishable files.');
const files = [...new Set(result.stdout.split('\0').filter(Boolean))];
const issues = [];
const patterns = [
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  [
    'populated credential',
    /^\s*(?:AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|GITHUB_TOKEN|GH_TOKEN)\s*=\s*\S+/m,
  ],
  ['account identifier', /\b\d{12}\b/],
  ['personal Windows path', /[A-Z]:[/\\]Users[/\\][^/\\\s]+/],
  ['personal Unix path', /\/(?:Users|home)\/[a-zA-Z][^/\s]+\//],
];
for (const file of files) {
  const ignored = run([...prefix, 'check-ignore', '--no-index', '-q', '--', file]);
  if (ignored.status === 0) {
    issues.push(`${file}: ignored/private file is tracked`);
    continue;
  }
  if (
    ['/AWS_DISCOVERY.md', '/SECURITY_PLAN.md'].includes(`/${file}`) ||
    file.startsWith('.private/') ||
    /^public\/assets\/deck\/.*\.png$/i.test(file)
  ) {
    issues.push(`${file}: private or paid source asset`);
    continue;
  }
  const info = await stat(file);
  if (info.size > 20 * 1024 * 1024) issues.push(`${file}: large asset needs review`);
  if (['.png', '.jpg', '.jpeg', '.webp', '.mp4', '.wav', '.ico'].includes(extname(file))) continue;
  const text = await readFile(file, 'utf8');
  for (const [label, pattern] of patterns)
    if (pattern.test(text)) issues.push(`${file}: possible ${label}`);
}
if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else
  console.info(
    `Checked ${files.length} publishable files: no private paths, paid deck originals, or targeted secret patterns found. This check complements, not replaces, a full history secret scan.`,
  );
