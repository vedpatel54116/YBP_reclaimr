import { PrismaClient } from "@prisma/client";
import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

/**
 * Prisma client lifecycle: one client per process, disconnected on close.
 * Wrapped in fastify-plugin so the decoration lands on the root scope
 * (without it, encapsulation would hide `prisma` from sibling plugins).
 */
export const prismaPlugin: FastifyPluginAsync = fp(
  async (app) => {
    const prisma = new PrismaClient();
    await app.decorate("prisma", prisma);
    app.addHook("onClose", async () => {
      await prisma.$disconnect();
    });
  },
  { name: "prisma" },
);
