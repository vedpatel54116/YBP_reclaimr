import { beforeEach, describe, expect, it } from "vitest";
import { QUEUE_NAMES } from "@reclaimr/queue";
import { SyncPipeline } from "../../src/modules/detection/sync-pipeline";
import type { SyncResult } from "../../src/modules/transactions/transaction-sync.service";

/**
 * The pipeline has two modes that must stay behaviourally equivalent: queued
 * (Redis present — the worker runs the stages) and inline (no Redis — the
 * request runs them). Getting this wrong means either a silently un-synced
 * account or a request that blocks on a slow Plaid call.
 */

const USER = "11111111-1111-4111-8111-111111111111";
const ITEM = "33333333-3333-4333-8333-333333333333";

interface Enqueued {
  name: string;
  payload: unknown;
}

/** Minimal JobProducer stand-in: records what would be enqueued. */
class RecordingQueue {
  readonly enqueued: Enqueued[] = [];

  async add(name: string, payload: unknown): Promise<{ id: string }> {
    this.enqueued.push({ name, payload });
    return { id: `job-${this.enqueued.length}` };
  }
}

function syncResult(): SyncResult {
  return { plaidItemId: ITEM, added: 3, updated: 1, removed: 0, requiresReauth: false };
}

/** Records the order stages ran, so inline sequencing is observable. */
function stageRecorder() {
  const calls: string[] = [];
  return {
    calls,
    syncTransactions: {
      syncItem: async (plaidItemId: string) => {
        calls.push(`sync:${plaidItemId}`);
        return syncResult();
      },
    },
    detectSubscriptions: {
      runForUser: async (userId: string) => {
        calls.push(`subs:${userId}`);
        return undefined;
      },
    },
    detectBills: {
      runForUser: async (userId: string) => {
        calls.push(`bills:${userId}`);
        return undefined;
      },
    },
    evaluateAlerts: {
      evaluateUser: async (userId: string) => {
        calls.push(`alerts:${userId}`);
        return 0;
      },
    },
  };
}

let stages: ReturnType<typeof stageRecorder>;

beforeEach(() => {
  stages = stageRecorder();
});

describe("SyncPipeline with a queue (Redis configured)", () => {
  it("enqueues one plaid.sync job and runs nothing inline", async () => {
    const queue = new RecordingQueue();
    const pipeline = new SyncPipeline({
      ...stages,
      queue: queue as unknown as SyncPipelineQueue,
    });

    const result = await pipeline.runForItem(USER, ITEM);

    expect(result).toEqual({ mode: "queued", sync: null });
    expect(queue.enqueued).toEqual([
      { name: QUEUE_NAMES.plaidSync, payload: { userId: USER, plaidItemId: ITEM } },
    ]);
    // The worker owns the follow-up stages; the request must not run them.
    expect(stages.calls).toEqual([]);
  });

  it("reports queued without waiting on a sync result", async () => {
    const queue = new RecordingQueue();
    const pipeline = new SyncPipeline({
      ...stages,
      queue: queue as unknown as SyncPipelineQueue,
    });

    const result = await pipeline.runForItem(USER, ITEM);

    expect(result.sync).toBeNull();
  });
});

describe("SyncPipeline without a queue (inline fallback)", () => {
  it("runs sync, both detections, then alerts — in that order", async () => {
    const pipeline = new SyncPipeline({ ...stages, queue: null });

    const result = await pipeline.runForItem(USER, ITEM);

    expect(result.mode).toBe("inline");
    expect(result.sync).toEqual(syncResult());
    expect(stages.calls).toEqual([
      `sync:${ITEM}`,
      `subs:${USER}`,
      `bills:${USER}`,
      `alerts:${USER}`,
    ]);
  });

  it("propagates a sync failure and skips the follow-up stages", async () => {
    const failing = {
      ...stages,
      queue: null,
      syncTransactions: {
        syncItem: () => Promise.reject(new Error("plaid unavailable")),
      },
    };
    const pipeline = new SyncPipeline(failing);

    await expect(pipeline.runForItem(USER, ITEM)).rejects.toThrow("plaid unavailable");
    // Detection over a half-synced history would produce wrong results.
    expect(stages.calls).toEqual([]);
  });
});

/** The structural shape SyncPipeline needs from a JobProducer. */
type SyncPipelineQueue = ConstructorParameters<typeof SyncPipeline>[0]["queue"];
