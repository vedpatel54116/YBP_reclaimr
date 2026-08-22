// Single source of truth for API shapes. Zod schemas define requests and
// responses; `contracts/` maps each endpoint to its schemas. Both the Fastify
// routes in apps/api and the clients in apps/web import from here.

export * from "./constants";
export * from "./types/http";

// Common wire primitives
export * from "./schemas/common";
export * from "./schemas/pagination";

// Domain schemas
export * from "./schemas/health";
export * from "./schemas/auth";
export * from "./schemas/user";
export * from "./schemas/account";
export * from "./schemas/plaid";
export * from "./schemas/transaction";
export * from "./schemas/merchant";
export * from "./schemas/subscription";
export * from "./schemas/bill";
export * from "./schemas/cancellation";
export * from "./schemas/negotiation";
export * from "./schemas/savings";
export * from "./schemas/alert";
export * from "./schemas/notification";
export * from "./schemas/premium";
export * from "./schemas/admin";
export * from "./schemas/ai";

// Endpoint contracts
export * from "./contracts/auth";
export * from "./contracts/users";
export * from "./contracts/plaid";
export * from "./contracts/accounts";
export * from "./contracts/transactions";
export * from "./contracts/subscriptions";
export * from "./contracts/bills";
export * from "./contracts/cancellations";
export * from "./contracts/negotiations";
export * from "./contracts/savings";
export * from "./contracts/alerts";
export * from "./contracts/notifications";
export * from "./contracts/premium";
export * from "./contracts/admin";
export * from "./contracts/ai";
