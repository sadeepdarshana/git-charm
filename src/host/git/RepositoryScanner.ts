import * as fs from 'fs/promises';
import * as path from 'path';

export interface RepositoryScanOptions {
  ignoreEnabled: boolean;
  patterns: string;
  mode: 'masks' | 'regex';
}

export const DEFAULT_REPOSITORY_SCAN_OPTIONS: RepositoryScanOptions = {
  ignoreEnabled: true,
  patterns: 'node_modules, .gradle, .m2, .ivy2, .cache, .venv, venv, __pycache__, cmake-build-*, CMakeFiles',
  mode: 'masks',
};

/** Masks without slashes match folder names at any depth; paths are root-relative. */
export function createScanIgnore(options: RepositoryScanOptions): (relativePath: string) => boolean {
  if (!options.ignoreEnabled) return () => false;
  if (options.mode === 'regex') {
    const regex = new RegExp(options.patterns);
    return relativePath => options.patterns.length > 0 && regex.test(relativePath);
  }
  const masks = options.patterns.split(/[,;\n]/).map(mask => mask.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')).filter(Boolean);
  const expressions = masks.map(mask => {
    let source = '';
    for (let i = 0; i < mask.length; i++) {
      const char = mask[i];
      if (char === '*' && mask[i + 1] === '*') {
        i++;
        if (mask[i + 1] === '/') { i++; source += '(?:.*/)?'; }
        else source += '.*';
      } else if (char === '*') source += '[^/]*';
      else if (char === '?') source += '[^/]';
      else source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return { regex: new RegExp(`^${source}$`), nameOnly: !mask.includes('/') };
  });
  return relativePath => expressions.some(({ regex, nameOnly }) => regex.test(nameOnly ? path.posix.basename(relativePath) : relativePath));
}

export interface GitRootReviewItem { rootPath: string; name: string; existing: boolean; detected: boolean }
export interface GitRootAnalysisResult { summary: string; reviewId?: string; roots?: GitRootReviewItem[] }

export interface RepositoryScanResult { roots: string[]; unreadable: number; cancelled: boolean; visited: number; elapsedMs: number }

/** Async, unlimited-depth walk, including repositories nested inside repositories. */
export async function scanRepositoryRoots(
  root: string,
  options: RepositoryScanOptions,
  isCancelled: () => boolean = () => false,
  onProgress: (relativePath: string, visited: number) => void = () => {},
): Promise<RepositoryScanResult> {
  const ignore = createScanIgnore(options);
  const started = performance.now();
  const result: RepositoryScanResult = { roots: [], unreadable: 0, cancelled: false, visited: 0, elapsedMs: 0 };
  const pending = [root];
  // Bound filesystem concurrency instead of awaiting every directory serially.
  // This performs no sleeps and keeps queued work small for prompt cancellation.
  while (pending.length > 0) {
    if (isCancelled()) { result.cancelled = true; break; }
    const batch = pending.splice(-8);
    await Promise.all(batch.map(async directory => {
      if (isCancelled()) { result.cancelled = true; return; }
      result.visited++;
      onProgress(path.relative(root, directory), result.visited);
      let entries;
      try { entries = await fs.readdir(directory, { withFileTypes: true }); }
      catch (error) {
        if (directory === root) throw error;
        result.unreadable++;
        return;
      }
      if (isCancelled()) { result.cancelled = true; return; }
      if (entries.some(entry => entry.name === '.git' && (entry.isDirectory() || entry.isFile()))) {
        result.roots.push(directory);
      }
      for (const entry of entries) {
        // Never follow symlinks or descend into Git's internal object database.
        if (entry.name === '.git' || !entry.isDirectory() || entry.isSymbolicLink()) continue;
        const child = path.join(directory, entry.name);
        if (!ignore(path.relative(root, child).split(path.sep).join('/'))) pending.push(child);
      }
    }));
  }
  result.cancelled ||= isCancelled();
  result.elapsedMs = Math.round(performance.now() - started);
  return result;
}
