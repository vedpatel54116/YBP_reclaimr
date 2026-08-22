import { describe, expect, it } from "vitest";
import {
  aiGenerateJobSchema,
  alertsJobSchema,
  dailyMaintenanceJobId,
  dailySyncJobId,
  detectionJobSchema,
  maintenanceJobSchema,
  plaidSyncJobSchema,
} from "../src/jobs";
import { ALL_QUEUES, QUEUE_NAMES } from "../src/names";

const UUID = "0b9a6c8e-6f2a-4d4e-9d3a-2f5e8a1c7b33";

describe("job payload schemas", () => {
  it("accepts a valid sync payload", () => {
    expect(plaidSyncJobSchema.parse({ userId: UUID, plaidItemId: UUID })).toEqual({
      userId: UUID,
      plaidItemId: UUID,
    });
  });

  it("rejects non-uuid ids", () => {
    expect(plaidSyncJobSchema.safeParse({ userId: "not-a-uuid", plaidItemId: UUID }).success).toBe(
      false,
    );
    expect(detectionJobSchema.safeParse({ userId: 42 }).success).toBe(false);
    expect(alertsJobSchema.safeParse({}).success).toBe(false);
  });

  it("maintenance jobs may carry a calendar date", () => {
    expect(maintenanceJobSchema.parse({ date: "2026-08-22" }).date).toBe("2026-08-22");
    expect(maintenanceJobSchema.parse({}).date).toBeUndefined();
    expect(maintenanceJobSchema.safeParse({ date: "08/22/2026" }).success).toBe(false);
  });

  it("accepts a valid ai.generate payload", () => {
    expect(
      aiGenerateJobSchema.parse({ userId: UUID, kind: "alternative_advice", subjectId: UUID }),
    ).toEqual({ userId: UUID, kind: "alternative_advice", subjectId: UUID });
  });

  it("rejects an unknown ai suggestion kind", () => {
    expect(
      aiGenerateJobSchema.safeParse({ userId: UUID, kind: "bogus", subjectId: UUID }).success,
    ).toBe(false);
  });

  it("requires a subject on ai.generate jobs", () => {
    expect(aiGenerateJobSchema.safeParse({ userId: UUID, kind: "digest" }).success).toBe(false);
  });
});

describe("job id builders", () => {
  it("produces stable, day-scoped ids for scheduled syncs", () => {
    expect(dailySyncJobId(UUID, "2026-08-22")).toBe(`plaid.sync.daily:${UUID}:2026-08-22`);
    expect(dailyMaintenanceJobId("2026-08-22")).toBe("maintenance.daily:2026-08-22");
  });
});

describe("queue names", () => {
  it("are unique across the system", () => {
    expect(new Set(ALL_QUEUES).size).toBe(ALL_QUEUES.length);
  });

  it("cover the four background concerns plus maintenance", () => {
    expect(QUEUE_NAMES.plaidSync).toBe("plaid.sync");
    expect(QUEUE_NAMES.detectionSubscriptions).toBe("detection.subscriptions");
    expect(QUEUE_NAMES.detectionBills).toBe("detection.bills");
    expect(QUEUE_NAMES.alertsEvaluate).toBe("alerts.evaluate");
  });

  it("includes the ai.generate queue", () => {
    expect(QUEUE_NAMES.aiGenerate).toBe("ai.generate");
    expect(ALL_QUEUES).toContain("ai.generate");
  });
});
