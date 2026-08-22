import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { verifyAccessToken, type AccessTokenSubject } from "../modules/auth/tokens";
import { roleHasCapability, type AdminCapability } from "../modules/admin/permissions";
import { verifyAdminToken, type AdminTokenSubject } from "../modules/admin/tokens";
import { forbidden, unauthorized } from "../lib/errors";

declare module "fastify" {
  interface FastifyInstance {
    /** Route guard: verifies the member Bearer token and sets `request.user`. */
    requireAuth: (request: FastifyRequest) => Promise<void>;
    /**
     * Route guard for the staff realm: verifies an admin Bearer token, confirms
     * the account is still active, and sets `request.admin`.
     */
    requireAdmin: (request: FastifyRequest) => Promise<void>;
    /**
     * Capability guard for the staff realm. Runs `requireAdmin` first, so admin
     * routes need only this one preHandler:
     *
     *   { preHandler: app.requireCapability("merchants.write") }
     */
    requireCapability: (capability: AdminCapability) => (request: FastifyRequest) => Promise<void>;
  }

  interface FastifyRequest {
    /** Populated by `requireAuth`; null for anonymous requests. */
    user: AccessTokenSubject | null;
    /** Populated by `requireAdmin`; null outside the staff realm. */
    admin: AdminTokenSubject | null;
  }
}

function bearer(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized("Missing bearer token");
  return header.slice("Bearer ".length);
}

/**
 * Auth guards for both realms.
 *
 * The realms are mutually exclusive by construction: member and staff tokens are
 * signed with different secrets and carry different audiences, so `requireAuth`
 * rejects a staff token and `requireAdmin` rejects a member token. Neither guard
 * can be satisfied by the other realm's credential.
 *
 * Wrapped in fastify-plugin so the decorations are visible to route plugins.
 */
export const authPlugin: FastifyPluginAsync = fp(
  async (app) => {
    app.decorateRequest("user", null);
    app.decorateRequest("admin", null);

    app.decorate("requireAuth", async (request: FastifyRequest) => {
      try {
        request.user = await verifyAccessToken(bearer(request));
      } catch (error) {
        // Preserve an explicit "missing token" as-is; anything else is a bad one.
        if (error instanceof Error && error.message === "Missing bearer token") throw error;
        throw unauthorized("Invalid or expired token", "INVALID_TOKEN");
      }
    });

    app.decorate("requireAdmin", async (request: FastifyRequest) => {
      const subject = await verifyAdminToken(bearer(request));

      // A valid token is not enough: deactivating an account must take effect
      // immediately rather than when the token happens to expire.
      const account = await app.prisma.adminUser.findUnique({
        where: { id: subject.sub },
        select: { isActive: true, role: true },
      });
      if (!account?.isActive) {
        throw unauthorized("This staff account is not active", "ADMIN_INACTIVE");
      }

      // Trust the database over the token for the role, so a demotion applies to
      // tokens already in the wild.
      request.admin = { ...subject, role: account.role };
    });

    app.decorate("requireCapability", (capability: AdminCapability) => {
      return async (request: FastifyRequest) => {
        await app.requireAdmin(request);
        const role = request.admin!.role;
        if (!roleHasCapability(role, capability)) {
          throw forbidden(`Your role (${role}) cannot ${capability}`, "INSUFFICIENT_ROLE");
        }
      };
    });
  },
  { name: "auth", dependencies: ["prisma"] },
);
