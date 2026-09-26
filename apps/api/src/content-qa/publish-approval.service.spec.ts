import { BadRequestException } from "@nestjs/common";

import { makeFakeDb } from "../test/fake-db";
import {
  LEGACY_PRE_APPROVED_ASSET_IDS,
  PublishApprovalService,
} from "./publish-approval.service";

describe("PublishApprovalService", () => {
  let db: ReturnType<typeof makeFakeDb>;
  let service: PublishApprovalService;

  beforeEach(() => {
    db = makeFakeDb();
    service = new PublishApprovalService(db.db);
  });

  it("requires a reason for every approval", async () => {
    await expect(service.grant({ assetId: "a", approvedBy: "owner", reason: "  " })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("requires an approver", async () => {
    await expect(service.grant({ assetId: "a", approvedBy: "", reason: "ok" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("records approver, reason and timestamp", async () => {
    const approval = await service.grant({
      assetId: "asset-1",
      approvedBy: "owner",
      reason: "QA reviewed",
      evidence: { qaVerdict: "pass" },
    });
    expect(approval.approvedBy).toBe("owner");
    expect(approval.reason).toBe("QA reviewed");
    expect(approval.grantedAt).toBeDefined();
    expect(approval.source).toBe("owner");
  });

  it("is idempotent per asset", async () => {
    const first = await service.grant({ assetId: "asset-1", approvedBy: "owner", reason: "first" });
    const second = await service.grant({ assetId: "asset-1", approvedBy: "someone", reason: "second" });
    expect(second.id).toBe(first.id);
    expect(db.rows.publishApproval).toHaveLength(1);
  });

  it("migrates the legacy hardcoded id into a real approval record", async () => {
    const result = await service.migrateLegacyApprovals();
    expect(result.migrated).toEqual([...LEGACY_PRE_APPROVED_ASSET_IDS]);
    const approval = await service.findForAsset(LEGACY_PRE_APPROVED_ASSET_IDS[0]);
    expect(approval?.approvedBy).toBe("owner-migration");
    expect(approval?.reason).toContain("PRE_APPROVED_PUBLISH_ASSET_IDS");
    expect(approval?.source).toBe("migration");
  });

  it("migration is idempotent across boots", async () => {
    await service.migrateLegacyApprovals();
    const second = await service.migrateLegacyApprovals();
    expect(second.migrated).toHaveLength(0);
    expect(second.skipped).toEqual([...LEGACY_PRE_APPROVED_ASSET_IDS]);
    expect(db.rows.publishApproval).toHaveLength(1);
  });

  it("lists approvals newest first", async () => {
    await service.grant({ assetId: "a1", approvedBy: "owner", reason: "r1" });
    await service.grant({ assetId: "a2", approvedBy: "owner", reason: "r2" });
    const list = await service.list();
    expect(list).toHaveLength(2);
    expect(list.map((a) => a.assetId)).toContain("a1");
  });
});
