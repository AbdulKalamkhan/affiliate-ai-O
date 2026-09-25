import type { PrismaClient } from "@ai-os/database";

export type DbClient = Pick<
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
>;