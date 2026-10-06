import { parentPort, workerData } from 'worker_threads';
import { scanRepositoryRoots, type RepositoryScanOptions, type RepositoryScanResult } from './RepositoryScanner';

export type ScanWorkerMessage =
  | { type: 'progress'; relativePath: string; visited: number }
  | { type: 'result'; result: RepositoryScanResult }
  | { type: 'error'; error: string };

const { root, options } = workerData as { root: string; options: RepositoryScanOptions };
let cancelled = false;
let lastReport = 0;
parentPort!.on('message', () => { cancelled = true; });
void scanRepositoryRoots(root, options, () => cancelled, (relativePath, visited) => {
  // Throttle messages, not scanning: no timers or sleeps.
  if (Date.now() - lastReport < 100) return;
  lastReport = Date.now();
  parentPort!.postMessage({ type: 'progress', relativePath, visited } satisfies ScanWorkerMessage);
}).then(result => {
  parentPort!.postMessage({ type: 'result', result } satisfies ScanWorkerMessage);
}, error => {
  parentPort!.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) } satisfies ScanWorkerMessage);
}).finally(() => parentPort!.close());
