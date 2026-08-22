import type { CaseActor, CaseStatus, TimelineEvent } from "../types";

/**
 * Case timelines are append-only: the history of a case is evidence, both for
 * the member ("what happened to my request?") and for dispute resolution
 * ("when was the fee agreed?"). Nothing here mutates its input.
 */

export interface TimelineEntryDraft {
  status: CaseStatus;
  actor: CaseActor;
  note?: string | null;
  /** Injected by the caller — core never reads the clock. */
  at: Date;
}

export function timelineEvent(draft: TimelineEntryDraft): TimelineEvent {
  return {
    at: draft.at.toISOString(),
    status: draft.status,
    actor: draft.actor,
    note: draft.note ?? null,
  };
}

/** Returns a new timeline with the entry appended. */
export function appendTimeline(
  timeline: readonly TimelineEvent[],
  draft: TimelineEntryDraft,
): TimelineEvent[] {
  return [...timeline, timelineEvent(draft)];
}

/** The most recent entry, or null for a timeline that has not started. */
export function latestTimelineEvent(timeline: readonly TimelineEvent[]): TimelineEvent | null {
  return timeline.length === 0 ? null : (timeline[timeline.length - 1] as TimelineEvent);
}
