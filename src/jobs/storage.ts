import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { TransformResult } from "../core/types";

export interface PollingJob {
  jobId: string;
  workspaceId: string;
  transformId: string;
  status: "processing" | "completed" | "failed" | "cancelled";
  progress?: number;
  progressMessage?: string;
  result?: TransformResult;
  error?: string;
  expiresAt: number;
}

/** Share this store between replicas; never return a job without checking its owner. */
export interface PollingJobStorage {
  get(jobId: string): Promise<PollingJob | null>;
  save(job: PollingJob): Promise<void>;
}

const MAX_JOBS = 256;
const MAX_BYTES = 64 * 1024 * 1024;

function bounded(records: PollingJob[]) {
  const serialized = JSON.stringify(records);
  if (records.length > MAX_JOBS || Buffer.byteLength(serialized) > MAX_BYTES) {
    throw new Error("Polling job storage capacity exceeded");
  }
  return serialized;
}

/** Bounded, expiring storage for development. Use persistent storage in production. */
export class MemoryPollingJobStorage implements PollingJobStorage {
  private jobs = new Map<string, PollingJob>();

  private prune() {
    for (const [id, job] of this.jobs) {
      if (job.expiresAt <= Date.now()) this.jobs.delete(id);
    }
  }

  async get(jobId: string): Promise<PollingJob | null> {
    this.prune();
    const job = this.jobs.get(jobId);
    return job ? structuredClone(job) : null;
  }

  async save(job: PollingJob): Promise<void> {
    this.prune();
    bounded(
      [...this.jobs.values()]
        .filter((item) => item.jobId !== job.jobId)
        .concat(job),
    );
    this.jobs.set(job.jobId, structuredClone(job));
  }
}

/**
 * Encrypted, atomic storage for one addon process. Keep the file on a volume.
 * Replicas must instead supply a shared database-backed PollingJobStorage.
 */
export class EncryptedFilePollingJobStorage implements PollingJobStorage {
  private readonly key: Buffer;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    encryptionKey: string,
  ) {
    if (!filePath || encryptionKey.length < 32) {
      throw new Error(
        "Polling storage requires a path and an encryption key of at least 32 characters",
      );
    }
    this.key = crypto
      .createHash("sha256")
      .update("paranod-polling-jobs\0")
      .update(encryptionKey)
      .digest();
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn, fn);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async read(): Promise<PollingJob[]> {
    let serialized: string;
    try {
      if ((await fs.stat(this.filePath)).size > MAX_BYTES * 2) {
        throw new Error("Polling storage file exceeds size limit");
      }
      serialized = await fs.readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const envelope = JSON.parse(serialized);
    if (envelope.version !== 1)
      throw new Error("Invalid polling storage format");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(envelope.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const records: PollingJob[] = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    );
    bounded(records);
    return records;
  }

  private async write(records: PollingJob[]): Promise<void> {
    const plaintext = bounded(records);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const envelope = JSON.stringify({
      version: 1,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    });
    await fs.mkdir(path.dirname(this.filePath), {
      recursive: true,
      mode: 0o700,
    });
    const temporary = `${this.filePath}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, envelope, { mode: 0o600, flag: "wx" });
      await fs.rename(temporary, this.filePath);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }

  get(jobId: string): Promise<PollingJob | null> {
    return this.exclusive(async () => {
      const all = await this.read();
      const active = all.filter((job) => job.expiresAt > Date.now());
      if (active.length !== all.length) await this.write(active);
      return active.find((job) => job.jobId === jobId) || null;
    });
  }

  save(job: PollingJob): Promise<void> {
    return this.exclusive(async () => {
      const records = (await this.read()).filter(
        (item) => item.expiresAt > Date.now() && item.jobId !== job.jobId,
      );
      await this.write([...records, job]);
    });
  }
}
