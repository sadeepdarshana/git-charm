import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'esbuild';
const run = promisify(execFile);
const temp = await mkdtemp(path.join(tmpdir(), 'gitcharm-branches-'));
const modulePath = path.join(temp, 'branches.cjs');
await build({ entryPoints: ['src/host/git/BranchMenuData.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: modulePath });
const { readBranchMenuData } = await import(modulePath);
const git = async (...args) => (await run('git', ['-C', temp, ...args])).stdout.trim();
try {
  await git('init', '-b', 'main');
  await git('config', 'user.name', 'Test'); await git('config', 'user.email', 'test@example.com');
  await test('unborn branch menu works without git status', async () => {
    const data = await readBranchMenuData(temp, temp);
    assert.equal(data.currentBranch.name, 'main'); assert.deepEqual(data.branches, []);
  });
  await writeFile(path.join(temp, 'tracked.txt'), 'first');
  await git('add', 'tracked.txt'); await git('commit', '-m', 'first');
  const first = await git('rev-parse', 'HEAD');
  await git('branch', 'feature/slashes'); await git('tag', '-a', 'release', '-m', 'release');
  await writeFile(path.join(temp, 'tracked.txt'), 'second');
  await git('commit', '-am', 'second');
  await git('remote', 'add', 'origin', temp);
  await git('update-ref', 'refs/remotes/origin/main', first);
  await git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  await git('branch', '--set-upstream-to=origin/main', 'main');
  await test('reads branches, remote refs, upstream counts, and annotated tags from refs', async () => {
    const data = await readBranchMenuData(temp, temp);
    assert.equal(data.currentBranch.name, 'main'); assert.equal(data.currentBranch.upstream, 'origin/main');
    assert.deepEqual(data.currentBranch.aheadBehind, { ahead: 1, behind: 0 });
    assert.ok(data.branches.some(branch => branch.name === 'feature/slashes'));
    assert.ok(data.branches.some(branch => branch.name === 'origin/main' && branch.isRemote));
    assert.equal(data.branches.some(branch => branch.name === 'origin/HEAD'), false);
    assert.equal(data.tags[0].name, 'release');
  });
  await git('checkout', '--detach', 'release');
  await test('detached annotated tag is resolved to its commit', async () => {
    const data = await readBranchMenuData(temp, temp);
    assert.equal(data.currentBranch.detachedTag, 'release'); assert.equal(data.currentBranch.name, 'HEAD');
  });
  await git('checkout', '--detach', 'main');
  await test('untagged detached HEAD displays its hash', async () => {
    const data = await readBranchMenuData(temp, temp);
    assert.equal(data.currentBranch.detachedTag, undefined);
    assert.equal(data.currentBranch.detachedFullHash, await git('rev-parse', 'HEAD'));
  });
} finally { await rm(temp, { recursive: true, force: true }); }
