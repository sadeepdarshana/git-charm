import * as path from 'path';
import { Worker } from 'worker_threads';
import type { RepositoryScanOptions, RepositoryScanResult } from './RepositoryScanner';
import type { ScanWorkerMessage } from './RepositoryScanWorker';

interface ScanCancellation {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): { dispose(): void };
}

/** Keep directory traversal off VS Code's shared extension-host event loop. */
export function scanRepositoryRootsInWorker(root: string, options: RepositoryScanOptions, token: ScanCancellation,
  onProgress: (relativePath: string, visited: number) => void): Promise<RepositoryScanResult> {
  if (token.isCancellationRequested) return Promise.resolve({ roots: [], unreadable: 0, cancelled: true, visited: 0, elapsedMs: 0 });
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'repositoryScanWorker.js'), { workerData: { root, options } });
    let settled = false;
    const cancellation = token.onCancellationRequested(() => worker.postMessage('cancel'));
    const finish = (error?: Error, result?: RepositoryScanResult) => {
      if (settled) return;
      settled = true;
      cancellation.dispose();
      if (error) reject(error);
      else resolve(result!);
    };
    worker.on('message', (message: ScanWorkerMessage) => {
      if (message.type === 'progress') onProgress(message.relativePath, message.visited);
      else if (message.type === 'result') finish(undefined, message.result);
      else finish(new Error(message.error));
    });
    worker.once('error', error => finish(error));
    worker.once('exit', code => { if (!settled) finish(new Error(`Git root scan worker exited without a result (${code}).`)); });
    if (token.isCancellationRequested) worker.postMessage('cancel');
  });
}
