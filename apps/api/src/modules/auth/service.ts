import type { PrismaClient, User as PrismaUser } from "@prisma/client";
import {
  CURRENT_CONSENT_VERSION,
  type AuthResponse,
  type RegisterRequest,
  type User,
} from "@reclaimr/shared";
import { conflict, unauthorized } from "../../lib/errors";
import type { AuditService, RequestContext } from "../../services/audit";
import { hashPassword, verifyPassword } from "./password";
import { generateRefreshToken, refreshExpiry, sha256, signAccessToken } from "./tokens";

function toUser(row: PrismaUser): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  };
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  async register(input: RegisterRequest, ctx: RequestContext): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw conflict("An account with this email already exists", "EMAIL_TAKEN");

    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name ?? null,
        passwordHash,
        // Signup implies accepting the current legal documents; the consent
        // ledger row is the compliance proof (who, what version, when, where).
        consents: {
          create: [
            {
              type: "terms_of_service",
              version: CURRENT_CONSENT_VERSION,
              ip: ctx.ip ?? null,
              userAgent: ctx.userAgent ?? null,
            },
            {
              type: "privacy_policy",
              version: CURRENT_CONSENT_VERSION,
              ip: ctx.ip ?? null,
              userAgent: ctx.userAgent ?? null,
            },
          ],
        },
      },
    });

    await this.audit.record({
      ...ctx,
      actorType: "member",
      actorId: user.id,
      userId: user.id,
      action: "auth.signup",
      targetType: "user",
      targetId: user.id,
    });
    return { user: toUser(user), tokens: await this.issueTokens(user.id) };
  }

  async login(
    input: { email: string; password: string },
    ctx: RequestContext,
  ): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Same error for unknown email, wrong password, and deleted accounts —
    // no account enumeration, and scheduled-for-deletion stays locked out.
    if (
      !user ||
      user.deletionScheduledAt ||
      !(await verifyPassword(input.password, user.passwordHash))
    ) {
      throw unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
    }

    await this.audit.record({
      ...ctx,
      actorType: "member",
      actorId: user.id,
      userId: user.id,
      action: "auth.login",
      targetType: "user",
      targetId: user.id,
    });
    return { user: toUser(user), tokens: await this.issueTokens(user.id) };
  }

  /**
   * Rotating refresh: the presented token is revoked and a fresh pair is
   * issued. A replayed (already revoked) token is rejected, which also
   * surfaces token theft — the legitimate client and the thief cannot both
   * hold a working token.
   */
  async refresh(refreshToken: string, ctx: RequestContext): Promise<AuthResponse> {
    const presented = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (!presented || presented.revokedAt || presented.expiresAt < new Date()) {
      throw unauthorized("Invalid refresh token", "INVALID_TOKEN");
    }
    if (presented.user.deletionScheduledAt) {
      // Deleted accounts must not be able to rotate back into a session.
      await this.prisma.refreshToken.update({
        where: { id: presented.id },
        data: { revokedAt: new Date() },
      });
      throw unauthorized("Invalid refresh token", "INVALID_TOKEN");
    }

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: presented.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    ]);

    await this.audit.record({
      ...ctx,
      actorType: "member",
      actorId: presented.userId,
      userId: presented.userId,
      action: "auth.token_refreshed",
      targetType: "user",
      targetId: presented.userId,
    });
    return { user: toUser(presented.user), tokens: await this.issueTokens(presented.userId) };
  }

  async logout(refreshToken: string, ctx: RequestContext): Promise<void> {
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count > 0) {
      await this.audit.record({
        ...ctx,
        actorType: "member",
        action: "auth.logout",
        targetType: "refresh_token",
        metadata: { count: revoked.count },
      });
    }
  }

  private async issueTokens(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const access = await signAccessToken(user);
    const refresh = generateRefreshToken();

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: refresh.tokenHash,
        expiresAt: refreshExpiry(),
      },
    });

    return {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken: refresh.token,
    };
  }
}
