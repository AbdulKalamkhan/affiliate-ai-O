import type { PrismaClient } from "@ai-os/database";

type DbModels = Pick<
  PrismaClient,
  | "opportunity"
  | "opportunityEvidence"
  | "affiliateLink"
  | "affiliateLinkClick"
  | "contentAsset"
  | "revenueEvent"
  | "profitRecord"
  | "bossCommand"
  | "bossPlan"
  | "bossTask"
  | "bossAction"
  | "bossAuditLog"
  | "bossApproval"
  | "bossToolCall"
  | "bossDecision"
  | "bossMemory"
  | "bossLesson"
  | "sellerAccount"
  | "sellerPermission"
  | "product"
  | "productVariant"
  | "sellerListing"
  | "sellerListingVersion"
  | "sellerInventory"
  | "sellerOrder"
  | "sellerOrderItem"
  | "sellerReturn"
  | "sellerSettlement"
  | "publishApproval"
>;

export type DbTransactionClient = DbModels;

/**
 * Database surface used by services.
 *
 * `$transaction` is REQUIRED (not optional) so that any multi-write money path
 * is forced to be atomic at the type level. Tests supply an in-memory
 * implementation via the fake client.
 */
export type DbClient = DbModels & {
  $transaction<T>(fn: (tx: DbTransactionClient) => Promise<T>): Promise<T>;
};