import type { PrismaClient } from "@prisma/client";
import type {
  Account,
  CreateLinkTokenResponse,
  ExchangePublicTokenRequest,
} from "@reclaimr/shared";
import type { TokenCipher } from "../../adapters/crypto/token-cipher";
import type { PlaidAdapter } from "../../adapters/plaid";
import { conflict } from "../../lib/errors";
import { toAccount } from "./mapper";

export interface ExchangeItemResult {
  plaidItemId: string;
  accounts: Account[];
}

/**
 * Plaid Link handshake: mint link tokens, exchange public tokens for a
 * persistent item + its accounts. The access token is encrypted the moment
 * it arrives and never leaves this service in plaintext.
 */
export class PlaidLinkService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly adapter: PlaidAdapter,
    private readonly cipher: TokenCipher,
  ) {}

  async createLinkToken(userId: string): Promise<CreateLinkTokenResponse> {
    const token = await this.adapter.createLinkToken({ userId });
    return { linkToken: token.linkToken, expiration: token.expiration };
  }

  /**
   * Exchange a public token for the item's accounts. Idempotent: replaying
   * the same public token returns the existing item (Plaid item ids are
   * unique per credential grant, and our unique constraint enforces it).
   */
  async exchange(userId: string, input: ExchangePublicTokenRequest): Promise<ExchangeItemResult> {
    const exchange = await this.adapter.exchangePublicToken(input.publicToken);

    const existingItem = await this.prisma.plaidItem.findUnique({
      where: { externalItemId: exchange.itemId },
    });
    if (existingItem && existingItem.userId !== userId) {
      throw conflict("This bank connection is already linked to another account");
    }

    const accountsView = await this.adapter.getAccounts(exchange.accessToken);
    const accessTokenEnc = this.cipher.encrypt(exchange.accessToken);

    const item = existingItem
      ? // Re-linking an item we already track: rotate the stored token.
        await this.prisma.plaidItem.update({
          where: { id: existingItem.id },
          data: {
            accessTokenEnc,
            status: "connected",
            lastSyncError: null,
            institutionId: input.institutionId ?? accountsView.institutionId ?? null,
            institutionName:
              input.institutionName ?? accountsView.institutionName ?? existingItem.institutionName,
          },
        })
      : await this.prisma.plaidItem.create({
          data: {
            userId,
            externalItemId: exchange.itemId,
            accessTokenEnc,
            institutionId: input.institutionId ?? accountsView.institutionId ?? null,
            institutionName:
              input.institutionName ?? accountsView.institutionName ?? "Linked Institution",
          },
        });

    const accounts: Account[] = [];
    for (const view of accountsView.accounts) {
      const row = await this.prisma.connectedAccount.upsert({
        where: {
          plaidItemId_externalAccountId: {
            plaidItemId: item.id,
            externalAccountId: view.externalAccountId,
          },
        },
        create: {
          userId,
          plaidItemId: item.id,
          externalAccountId: view.externalAccountId,
          institutionId: item.institutionId,
          institutionName: item.institutionName,
          name: view.name,
          type: view.type,
          mask: view.mask,
          balanceCents: view.balanceCents,
          currency: view.currency,
        },
        update: {
          // Refresh identity + balance on re-link.
          name: view.name,
          mask: view.mask,
          balanceCents: view.balanceCents,
          status: "connected",
        },
      });
      accounts.push(toAccount(row));
    }

    return { plaidItemId: item.id, accounts };
  }
}
