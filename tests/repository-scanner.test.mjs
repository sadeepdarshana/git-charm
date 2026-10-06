import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: ['src/host/git/RepositoryScanner.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { scanRepositoryRoots, createScanIgnore, DEFAULT_REPOSITORY_SCAN_OPTIONS } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

async function fixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'gitcharm-scan-'));
  const repo = async relative => { await mkdir(path.join(root, relative, '.git'), { recursive: true }); };
  try { await run(root, repo); } finally { await rm(root, { recursive: true, force: true }); }
}

test('finds root, deep nested repos, worktree files, and continues inside repositories', async () => {
  await fixture(async (root, repo) => {
    await repo(''); await repo('parent'); await repo('parent/deep/child');
    await mkdir(path.join(root, 'worktree'));
    await writeFile(path.join(root, 'worktree/.git'), 'gitdir: ../.git/worktrees/worktree');
    await repo('.git/objects/false-root');
    const result = await scanRepositoryRoots(root, DEFAULT_REPOSITORY_SCAN_OPTIONS);
    assert.deepEqual(result.roots.map(p => path.relative(root, p)).sort(), ['', 'parent', 'parent/deep/child', 'worktree']);
  });
});

test('defaults skip caches and CMake trees, but allow ordinary build folders', async () => {
  await fixture(async (root, repo) => {
    for (const name of ['node_modules', '.gradle', '.m2', 'cmake-build-debug', 'CMakeFiles', 'build']) await repo(`deep/${name}/repo`);
    const result = await scanRepositoryRoots(root, DEFAULT_REPOSITORY_SCAN_OPTIONS);
    assert.deepEqual(result.roots.map(p => path.relative(root, p)), ['deep/build/repo']);
  });
});

test('checkbox disables excludes; Git metadata is still skipped', async () => {
  await fixture(async (root, repo) => {
    await repo('node_modules/repo'); await repo('.git/false-root');
    const result = await scanRepositoryRoots(root, { ...DEFAULT_REPOSITORY_SCAN_OPTIONS, ignoreEnabled: false });
    assert.deepEqual(result.roots.map(p => path.relative(root, p)), ['', 'node_modules/repo']);
  });
});

test('masks handle names, paths, **, ?, punctuation, and separators', () => {
  const ignored = createScanIgnore({ ignoreEnabled: true, mode: 'masks', patterns: 'node_modules; **/cache-?\nthird-party/sdk, .gradle' });
  for (const relative of ['deep/node_modules', 'cache-a', 'deep/cache-b', 'third-party/sdk', 'deep/.gradle']) assert.equal(ignored(relative), true, relative);
  for (const relative of ['node_modules2', 'deep/cache-long', 'other/sdk', 'xgradle']) assert.equal(ignored(relative), false, relative);
});

test('regex matches normalized relative paths and rejects invalid expressions', () => {
  const ignored = createScanIgnore({ ignoreEnabled: true, mode: 'regex', patterns: '(^|/)(vendor|cache)(/|$)' });
  assert.equal(ignored('deep/vendor'), true);
  assert.equal(ignored('deep/myvendor'), false);
  assert.throws(() => createScanIgnore({ ignoreEnabled: true, mode: 'regex', patterns: '[' }));
});

test('symlinks are not followed, including loops and paths outside workspace', async () => {
  await fixture(async (root, repo) => {
    await repo('real');
    await symlink(root, path.join(root, 'loop'));
    await symlink(path.join(root, 'real'), path.join(root, 'linked'));
    const result = await scanRepositoryRoots(root, DEFAULT_REPOSITORY_SCAN_OPTIONS);
    assert.deepEqual(result.roots, [path.join(root, 'real')]);
  });
});

test('cancellation stops walking and a missing workspace is reported', async () => {
  await fixture(async (root, repo) => {
    await repo('deep/repo');
    let visits = 0;
    const result = await scanRepositoryRoots(root, DEFAULT_REPOSITORY_SCAN_OPTIONS, () => visits > 0, () => visits++);
    assert.equal(result.cancelled, true);
    assert.equal(visits, 1);
    await assert.rejects(scanRepositoryRoots(path.join(root, 'missing'), DEFAULT_REPOSITORY_SCAN_OPTIONS));
  });
});
