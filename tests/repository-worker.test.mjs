import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
const temp = await mkdtemp(path.join(tmpdir(), 'gitcharm-worker-test-'));
await build({ entryPoints: { runner: 'src/host/git/RepositoryScanRunner.ts', repositoryScanWorker: 'src/host/git/RepositoryScanWorker.ts' }, bundle: true, platform: 'node', format: 'cjs', outdir: temp });
const { scanRepositoryRootsInWorker } = await import(path.join(temp, 'runner.js'));
const options = { ignoreEnabled: true, mode: 'masks', patterns: 'node_modules' };
const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };
try {
  await mkdir(path.join(temp, 'workspace/deep/repo/.git'), { recursive: true });
  await test('packaged worker returns roots and scan metrics, and propagates failures', async () => {
    const result = await scanRepositoryRootsInWorker(path.join(temp, 'workspace'), options, token, () => {});
    assert.deepEqual(result.roots, [path.join(temp, 'workspace/deep/repo')]);
    assert.equal(result.visited, 3); assert.equal(result.cancelled, false); assert.ok(result.elapsedMs >= 0);
    await assert.rejects(scanRepositoryRootsInWorker(path.join(temp, 'missing'), options, token, () => {}), /ENOENT/);
  });
  await test('worker cancellation uses events and disposes the subscription', async () => {
    let cancel; let disposed = false;
    const cancellable = { isCancellationRequested: false, onCancellationRequested: callback => { cancel = callback; return { dispose: () => { disposed = true; } }; } };
    const pending = scanRepositoryRootsInWorker(path.join(temp, 'workspace'), options, cancellable, () => {});
    cancellable.isCancellationRequested = true; cancel();
    assert.equal((await pending).cancelled, true);
    assert.equal(disposed, true);
  });
} finally { await rm(temp, { recursive: true, force: true }); }
