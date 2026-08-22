// @reclaimr/core — pure domain logic.
//
// No I/O, no Prisma, no Redis, no Date.now(), no Math.random. Time is always
// injected by the caller, which makes every function here deterministic and
// exhaustively unit-testable against fixtures.

export * from "./types";
export * from "./stats";
export * from "./detection/normalize-merchant";
export * from "./detection/merchant-catalog";
export * from "./detection/cadence";
export * from "./detection/group-charges";
export * from "./detection/detect-subscriptions";
export * from "./detection/detect-bills";
export * from "./bills/schedule";
export * from "./money/monthly-equivalent";
export * from "./money/savings";
export * from "./money/case-money";
export * from "./cases/state-machine";
export * from "./cases/timeline";
export * from "./alerts/rules";
export * from "./rot";
