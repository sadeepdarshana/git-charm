import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, access, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const fixtureDir = await mkdtemp(path.join(tmpdir(), 'gitcharm-analysis-tests-'));
const output = path.join(fixtureDir, 'manager.cjs');
await build({ entryPoints: ['src/host/git/RepositoryScanWorker.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: path.join(fixtureDir, 'repositoryScanWorker.js') });
await build({
  entryPoints: ['src/host/git/WorkspaceGitManager.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: output,
  plugins: [{ name: 'mock-host', setup(build) {
    build.onResolve({ filter: /^vscode$|^\.\/GitService$|^\.\/VscodeGitApi$/ }, args => ({ path: args.path, namespace: 'mock-host' }));
    build.onLoad({ filter: /.*/, namespace: 'mock-host' }, args => ({ contents: args.path === 'vscode'
      ? `module.exports = global.__gitcharmTestVscode;`
      : args.path === './VscodeGitApi' ? `exports.getVscodeGitApi = () => global.__gitcharmTestVscode.gitApi;` : `exports.GitService = class {};`, loader: 'js' }));
  } }],
});
const state = new Map();
const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };
const host = {
  workspace: { workspaceFolders: [], getConfiguration: () => ({ get: () => ({}) }) },
  ProgressLocation: { Notification: 15 },
  Uri: { parse: uri => ({ fsPath: new URL(uri).pathname }) },
  window: { withProgress: async (_, run) => run({ report() {} }, token) },
};
global.__gitcharmTestVscode = host;
const { WorkspaceGitManager } = await import(output);
const options = { ignoreEnabled: true, mode: 'masks', patterns: 'node_modules' };
function manager() {
  const instance = Object.create(WorkspaceGitManager.prototype);
  instance.context = { workspaceState: { get: (key, fallback) => state.get(key) ?? fallback, update: async (key, value) => state.set(key, value) } };
  instance.reinitializeAndRefresh = () => {};
  return instance;
}
function folder(root) { return { name: path.basename(root), uri: { fsPath: root, toString: () => `file://${root}` } }; }

function reloadableManager() {
  const instance = manager();
  Object.assign(instance, { repos: new Map(), repoMetas: new Map(), prevHeads: new Map(), prevCommits: new Map(), prevUntracked: new Map(), reposListeners: [] });
  instance.disposeWatchers = () => {};
  instance.setupWatcher = () => {};
  instance.setupRepositoryAuxWatchers = () => {};
  instance.detectLinkedWorktree = () => ({ isWorktree: false });
  instance.getRepositoryScanMaxDepth = () => 10;
  instance.getRepositoryScanIgnoredFolders = () => [];
  return instance;
}
async function setup(name) {
  state.clear(); token.isCancellationRequested = false; host.gitApi = undefined;
  const root = path.join(fixtureDir, name);
  await mkdir(path.join(root, '.git'), { recursive: true });
  await mkdir(path.join(root, 'deep/repo/.git'), { recursive: true });
  host.workspace.workspaceFolders = [folder(root)];
  return { root, deep: path.join(root, 'deep/repo'), instance: reloadableManager() };
}

try {
  await test('analysis only previews roots; existing roots appear even when ignored', async () => {
    const { root, deep, instance } = await setup('preview');
    instance.repoMetas.set(root, { id: root, rootPath: root, name: 'workspace' });
    instance.repoMetas.set(deep, { id: deep, rootPath: deep, name: 'existing deep repo' });
    const result = await instance.analyzeGitRoots({ ...options, patterns: 'deep' });
    assert.equal(state.has('gitcharm.analyzedRoots'), false);
    assert.equal(state.has('gitcharm.removedGitRoots'), false);
    assert.deepEqual(result.roots.find(item => item.rootPath === deep), { rootPath: deep, name: 'existing deep repo', existing: true, detected: false });
    assert.equal(result.roots.find(item => item.rootPath === root).existing, true);
  });

  await test('apply selection saves checked roots, removes unchecked existing roots, and persists on reload', async () => {
    const { root, deep, instance } = await setup('selection');
    instance.reinitialize();
    const result = await instance.analyzeGitRoots(options);
    assert.equal(result.roots.length, 2);
    await assert.rejects(instance.applyGitRootSelection(result.reviewId, [fixtureDir]), /outside/);
    await instance.applyGitRootSelection(result.reviewId, [deep]);
    assert.deepEqual(state.get('gitcharm.analyzedRoots'), { [`file://${root}`]: ['deep/repo'] });
    assert.deepEqual(state.get('gitcharm.removedGitRoots'), [root]);
    await access(path.join(root, '.git'));
    const fresh = reloadableManager(); fresh.reinitialize();
    assert.equal(fresh.repos.has(root), false);
    assert.equal(fresh.repos.has(deep), true);
    await assert.rejects(instance.applyGitRootSelection(result.reviewId, [root]), /outdated/);
  });

  await test('removed roots stay removed until explicitly selected in another review', async () => {
    const { root, deep, instance } = await setup('removed');
    await writeFile(path.join(root, '.gitmodules'), '[submodule "deep"]\n  path = deep/repo\n  url = ../repo\n');
    host.gitApi = { repositories: [{ rootUri: { fsPath: deep } }] };
    instance.reinitialize();
    await instance.setGitRootRemoved(deep, true);
    const fresh = reloadableManager(); fresh.reinitialize();
    assert.equal(fresh.repos.has(deep), false, 'all background discovery sources honor removal');
    const result = await fresh.analyzeGitRoots(options);
    assert.equal(result.roots.find(item => item.rootPath === deep).existing, false);
    assert.deepEqual(state.get('gitcharm.removedGitRoots'), [deep], 'preview must not restore roots');
    await fresh.applyGitRootSelection(result.reviewId, [root, deep]);
    fresh.reinitialize();
    assert.equal(fresh.repos.has(deep), true);
    assert.deepEqual(state.get('gitcharm.removedGitRoots'), []);
  });

  await test('cancelled scans and workspace changes cannot apply a partial or stale review', async () => {
    const { root, instance } = await setup('cancel');
    token.isCancellationRequested = true;
    const cancelled = await instance.analyzeGitRoots(options);
    assert.match(cancelled.summary, /cancelled/);
    assert.equal(cancelled.roots, undefined);
    assert.equal(state.has('gitcharm.analyzedRoots'), false);
    token.isCancellationRequested = false;
    const result = await instance.analyzeGitRoots(options);
    host.workspace.workspaceFolders = [];
    await assert.rejects(instance.applyGitRootSelection(result.reviewId, [root]), /Workspace folders changed/);
  });

  await test('clearing every checkbox persists exclusions, and overlapping folders deduplicate the review', async () => {
    const { root, deep, instance } = await setup('clear');
    host.workspace.workspaceFolders.push(folder(path.join(root, 'deep')));
    const result = await instance.analyzeGitRoots(options);
    assert.equal(result.roots.length, 2);
    await instance.applyGitRootSelection(result.reviewId, []);
    assert.deepEqual(new Set(state.get('gitcharm.removedGitRoots')), new Set([root, deep]));
    instance.reinitialize();
    assert.equal(instance.repos.size, 0);
    await instance.setGitRootRemoved(deep, false);
    instance.reinitialize();
    assert.equal(instance.repos.has(deep), true);
  });

  await test('overlapping background refresh requests share one read of each repository', async () => {
    const { instance } = await setup('refresh');
    let reads = 0;
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    instance.repos.set('repo', { getStatusFresh: () => { reads++; return pending; } });
    instance.applySubmoduleStatus = statuses => statuses;
    const first = instance.getAllStatusesFresh();
    const second = instance.getAllStatusesFresh();
    assert.equal(reads, 1);
    finish({ repoId: 'repo', stagedFiles: [], unstagedFiles: [] });
    assert.deepEqual(await first, await second);
    await instance.getAllStatusesFresh();
    assert.equal(reads, 2, 'a later request must still read fresh status');
  });

  await test('invalid regex and overlapping scan requests leave root storage unchanged', async () => {
    const { instance } = await setup('invalid');
    await assert.rejects(instance.analyzeGitRoots({ ...options, mode: 'regex', patterns: '[' }));
    instance.analysisRunning = true;
    await assert.rejects(instance.analyzeGitRoots(options), /already running/);
    assert.equal(state.has('gitcharm.analyzedRoots'), false);
  });
} finally {
  delete global.__gitcharmTestVscode;
  await rm(fixtureDir, { recursive: true, force: true });
}
