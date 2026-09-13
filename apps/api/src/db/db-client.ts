import type { PrismaClient } from "@ai-os/database";

export type DbClient = Pick<
  PrismaClient,
  "opportunity" | "affiliateLink" | "affiliateLinkClick" | "contentAsset" | "revenueEvent" | "profitRecord"
>;