import { spawnSync } from 'node:child_process';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const run = (args, input) =>
  spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    input,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
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
const privateCardMaterial = (file) =>
  /^(?:artifacts|asset-sources|captures|public\/assets\/deck)\//i.test(file) ||
  /^docs\/(?:[^/]*-arcana-prompts\.[^/]+|(?:card|deck)-prompts\/.*)$/i.test(file);
// Deleting a file in a later commit or ignoring it does not remove its history.
if (repo.status === 0) {
  // Enumerate file changes, not one path per blob: Git can reuse a public blob
  // at a private path, and rev-list --objects would report only one alias.
  const history = run([
    'log',
    '--all',
    '--format=',
    '--name-only',
    '-z',
    '--no-renames',
    '--root',
    '-m',
  ]);
  if (history.status !== 0) throw new Error('Cannot inspect Git history for private card assets.');
  const historicalPaths = new Set(history.stdout.split('\0').filter(Boolean));
  // Local tools may keep direct tree checkpoints outside commit history.
  const refs = run([
    'for-each-ref',
    '--format=%(objecttype) %(objectname) %(*objecttype) %(*objectname)',
  ]);
  if (refs.status !== 0) throw new Error('Cannot inspect Git checkpoint references.');
  const trees = new Set();
  for (const line of refs.stdout.trim().split('\n')) {
    const [type, oid, targetType, targetOid] = line.split(' ');
    if (type === 'tree') trees.add(oid);
    else if (targetType === 'tree') trees.add(targetOid);
  }
  for (const oid of trees) {
    const tree = run(['ls-tree', '-r', '--name-only', '-z', oid]);
    if (tree.status !== 0) throw new Error('Cannot inspect a Git checkpoint tree.');
    for (const path of tree.stdout.split('\0').filter(Boolean)) historicalPaths.add(path);
  }
  for (const file of historicalPaths)
    if (privateCardMaterial(file)) issues.push(`${file}: private card material in Git history`);
}
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
    privateCardMaterial(file)
  ) {
    issues.push(`${file}: private record, card artwork or generation material`);
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
    `Checked ${files.length} publishable files and available Git history: no private card material, private paths, or targeted secret patterns found. This check complements, not replaces, a full history secret scan.`,
  );
