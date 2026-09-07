import type { CompatibilityReport } from '@/core/merge/errors';
import { createLogger, fmtMs } from '@/core/util/log';
import type { ProgressInfo, WorkerRequestBody, WorkerResponse } from './protocol';

const log = createLogger('worker-client');

export class WorkerRequestError extends Error {
  constructor(
    message: string,
    readonly workerErrorName: string,
    readonly report?: CompatibilityReport,
    readonly workerStack?: string,
  ) {
    super(message);
    this.name = 'WorkerRequestError';
  }
}

interface Pending {
  label: string;
  startedAt: number;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: ProgressInfo) => void;
}

export interface RequestOptions {
  transfer?: Transferable[];
  onProgress?: (progress: ProgressInfo) => void;
  label?: string;
}

/** Promise-based façade over the merge worker; one request id per call, progress events routed per request. */
export class MergeWorkerClient {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  readonly ready: Promise<void>;

  constructor() {
    let resolveReady!: () => void;
    this.ready = new Promise<void>((r) => (resolveReady = r));
    const t0 = performance.now();
    this.worker = new Worker(new URL('./merge.worker.ts', import.meta.url), { type: 'module', name: 'jwmerge-worker' });
    log.info('spawning merge worker');

    this.worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      switch (msg.type) {
        case 'ready':
          log.info(`worker ready in ${fmtMs(performance.now() - t0)}`);
          resolveReady();
          break;
        case 'progress': {
          const p = this.pending.get(msg.requestId);
          log.debug(`${p?.label ?? msg.requestId} progress`, msg.progress);
          p?.onProgress?.(msg.progress);
          break;
        }
        case 'result': {
          const p = this.pending.get(msg.requestId);
          if (!p) return;
          this.pending.delete(msg.requestId);
          log.debug(`${p.label} ✓ ${fmtMs(performance.now() - p.startedAt)}`);
          p.resolve(msg.payload);
          break;
        }
        case 'error': {
          const p = this.pending.get(msg.requestId);
          if (!p) return;
          this.pending.delete(msg.requestId);
          log.error(`${p.label} ✗ ${msg.name}: ${msg.message}`, msg.stack ?? '');
          p.reject(new WorkerRequestError(msg.message, msg.name, msg.report, msg.stack));
          break;
        }
      }
    });
    this.worker.addEventListener('error', (e) => {
      log.error('worker crashed', e.message, e);
      const err = new WorkerRequestError(`The background worker crashed: ${e.message}`, 'WorkerCrash');
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    });
    this.worker.addEventListener('messageerror', (e) => log.error('worker message could not be deserialized', e));
  }

  request<T>(body: WorkerRequestBody, opts: RequestOptions = {}): Promise<T> {
    const requestId = this.nextId++;
    const label = opts.label ?? body.type;
    log.debug(`→ ${label} (#${requestId})`);
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, {
        label,
        startedAt: performance.now(),
        resolve: resolve as (v: unknown) => void,
        reject,
        onProgress: opts.onProgress,
      });
      this.worker.postMessage({ ...body, requestId }, opts.transfer ?? []);
    });
  }

  get inFlight(): number {
    return this.pending.size;
  }

  terminate(): void {
    log.warn('terminating worker');
    this.worker.terminate();
    const err = new WorkerRequestError('Worker terminated', 'Terminated');
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }
}
