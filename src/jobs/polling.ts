import type { JobContext, TransformResult } from "../core/types";
import type { PollingJob, PollingJobStorage } from "./storage";

export const POLLING_RESULT_TTL_MS = 60 * 60_000;

/** Serializes progress/terminal writes; late progress cannot erase a result. */
export class PollingJobTracker implements JobContext {
  readonly jobId: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private record: PollingJob,
    private readonly storage: PollingJobStorage,
  ) {
    this.jobId = record.jobId;
  }

  private update(change: Partial<PollingJob>): Promise<void> {
    const operation = this.queue.then(async () => {
      if (this.record.status !== "processing") return;
      const next = { ...this.record, ...change };
      if (next.status !== "processing")
        next.expiresAt = Date.now() + POLLING_RESULT_TTL_MS;
      await this.storage.save(next);
      this.record = next;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  updateProgress(progress: number, message?: string): Promise<void> {
    if (!Number.isFinite(progress))
      return Promise.reject(new Error("Invalid job progress"));
    return this.update({
      progress: Math.round(Math.min(100, Math.max(0, progress))),
      progressMessage: message?.slice(0, 1000),
    });
  }

  complete(result: TransformResult): Promise<void> {
    if (Buffer.byteLength(JSON.stringify(result)) > 4 * 1024 * 1024) {
      return Promise.reject(new Error("Polling result exceeds size limit"));
    }
    return this.update({ status: "completed", progress: 100, result });
  }

  fail(error: string): Promise<void> {
    return this.update({ status: "failed", error: error.slice(0, 2000) });
  }

  cancel(): Promise<void> {
    return this.update({ status: "cancelled", error: "Cancelled by addon" });
  }
}
