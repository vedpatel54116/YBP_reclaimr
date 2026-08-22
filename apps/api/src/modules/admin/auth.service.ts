import type { PrismaClient } from "@prisma/client";
import type { AdminLoginInput, AdminSession } from "@reclaimr/shared";
import { adminMfaRequired, type Env } from "../../env";
import { unauthorized } from "../../lib/errors";
import type { TokenCipher } from "../../adapters/crypto/token-cipher";
import { verifyPassword } from "../auth/password";
import type { AuditService, RequestContext } from "../../services/audit";
import { signAdminToken } from "./tokens";
import { verifyTotp } from "./totp";

/**
 * Staff authentication.
 *
 * Separate from member auth on purpose (D6): different credentials store,
 * different token realm, mandatory second factor in production, and no refresh
 * tokens at all. Staff sessions are short and re-authenticated rather than
 * silently extended, because a stolen staff token reads across every member's
 * data while a stolen member token reads one account.
 */
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly cipher: TokenCipher,
    private readonly config: Env,
  ) {}

  async login(input: AdminLoginInput, ctx: RequestContext): Promise<AdminSession> {
    const admin = await this.prisma.adminUser.findUnique({ where: { email: input.email } });

    // One error for every failure mode below — unknown email, wrong password,
    // deactivated account, bad or missing MFA code. Staff emails are guessable,
    // so the response must not confirm which part was wrong.
    const deny = async (reason: string): Promise<never> => {
      await this.audit.record({
        ...ctx,
        actorType: "admin",
        actorId: admin?.id ?? null,
        action: "admin.login_failed",
        targetType: "admin_user",
        targetId: admin?.id ?? null,
        metadata: { email: input.email, reason },
      });
      throw unauthorized("Invalid credentials", "INVALID_CREDENTIALS");
    };

    if (!admin) {
      // Still spend the cost of a hash comparison so a missing account is not
      // detectably faster than a wrong password.
      await verifyPassword(input.password, DUMMY_HASH);
      return deny("unknown_email");
    }
    if (!admin.isActive) return deny("inactive");
    if (!(await verifyPassword(input.password, admin.passwordHash))) {
      return deny("bad_password");
    }

    const mfaRequired = adminMfaRequired(this.config);
    if (admin.mfaSecret) {
      if (!input.mfaCode) return deny("mfa_required");

      let secret: string;
      try {
        secret = this.cipher.decrypt(admin.mfaSecret);
      } catch {
        return deny("mfa_secret_unreadable");
      }
      if (!verifyTotp(secret, input.mfaCode)) return deny("mfa_invalid");
    } else if (mfaRequired) {
      // Enforced rather than skipped: an unenrolled account in production is a
      // gap, and silently allowing it would make the requirement meaningless.
      return deny("mfa_not_enrolled");
    }

    const token = await signAdminToken({ id: admin.id, email: admin.email, role: admin.role });

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.record({
      ...ctx,
      actorType: "admin",
      actorId: admin.id,
      action: "admin.login",
      targetType: "admin_user",
      targetId: admin.id,
      metadata: { role: admin.role, mfa: Boolean(admin.mfaSecret) },
    });

    return {
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        mfaEnabled: Boolean(admin.mfaSecret),
      },
      accessToken: token.token,
      expiresIn: token.expiresIn,
    };
  }

  /** Re-issue the session view for an already-authenticated staff token. */
  async me(adminId: string): Promise<AdminSession> {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin || !admin.isActive) {
      throw unauthorized("This staff account is not active", "ADMIN_INACTIVE");
    }

    const token = await signAdminToken({ id: admin.id, email: admin.email, role: admin.role });
    return {
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        mfaEnabled: Boolean(admin.mfaSecret),
      },
      accessToken: token.token,
      expiresIn: token.expiresIn,
    };
  }
}

/**
 * A real bcrypt hash of a random value. Comparing against it for unknown emails
 * keeps the timing of "no such account" indistinguishable from a wrong password.
 */
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.7yTMuLPd0nR7cVvS0kk0Ojx8QQpFa6O";
