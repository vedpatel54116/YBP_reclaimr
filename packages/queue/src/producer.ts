import { Queue } from "bullmq";
import type { JobsOptions } from "bullmq";
import Redis from "ioredis";
import { DEFAULT_JOB_OPTIONS, type QueueName } from "./names";

/**
 * BullMQ producer (never a worker — D7). Owns one shared Redis connection
 * and lazily creates one Queue per name. Safe to construct per process.
 */
export class JobProducer {
  private readonly connection: Redis;
  private readonly queues = new Map<QueueName, Queue>();
  private closed = false;

  constructor(redisUrl: string) {
    // BullMQ requires blocking connections; maxRetriesPerRequest must be null.
    this.connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  }

  private queue(name: QueueName): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;
    const queue = new Queue(name, {
      connection: this.connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    this.queues.set(name, queue);
    return queue;
  }

  /**
   * Enqueue a job. Payload schemas are validated by callers (or by
   * `enqueueChecked`); passing `jobId` enables dedup — see jobs.ts for when
   * that is safe.
   */
  async add<T extends object>(
    name: QueueName,
    payload: T,
    options: { jobId?: string; jobOptions?: JobsOptions } = {},
  ): Promise<string> {
    if (this.closed) throw new Error("JobProducer is closed");
    const queue = this.queue(name);
    const job = await queue.add(name, payload, {
      ...options.jobOptions,
      ...(options.jobId ? { jobId: options.jobId } : {}),
    });
    if (!job?.id) throw new Error(`Failed to enqueue job on ${name}`);
    return job.id;
  }

  /** Close queues and the shared connection. Idempotent. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.connection.disconnect();
  }
}
