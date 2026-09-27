import { makeFakeDb } from "../test/fake-db";
import { API_KEY_PRINCIPAL, UNRESOLVED_PRINCIPAL, type Principal } from "../security/principal";
import { RevenueController } from "./revenue.controller";
import { SellerController } from "../seller/seller.controller";
import { MarketplaceRegistryService } from "../seller/marketplace/marketplace-registry.service";
import { SellerService } from "../seller/seller.service";
import { RevenueService } from "./revenue.service";

/**
 * Audit-identity spoofing regression tests.
 *
 * `actor` used to be read straight out of the request body by
 * `revenue.service` and `seller.service`, so any caller holding the deployment
 * API key could write a `money_write` audit row naming somebody else —
 * including "owner". An audit trail whose author is chosen by the audited party
 * is not an audit trail.
 *
 * The controller must therefore always overwrite the body value with the
 * AUTHENTICATED principal's id.
 */
describe("money-write audit identity", () => {
  const makeRevenue = () => {
    const { db, rows } = makeFakeDb();
    return { controller: new RevenueController(new RevenueService(db)), rows };
  };

  const makeSeller = () => {
    const { db, rows } = makeFakeDb();
    const service = new SellerService(db);
    const controller = new SellerController(service, new MarketplaceRegistryService());
    return { controller, service, rows };
  };

  it("ignores a forged actor in the body and names the authenticated principal", async () => {
    const { controller, rows } = makeRevenue();
    await controller.record(
      { value: 250, provider: "amazon-associates", eventType: "commission", actor: "ceo-impersonator" },
      API_KEY_PRINCIPAL,
    );
    const audit = rows.bossAuditLog!.find((r) => r.verb === "money_write");
    expect(audit?.actor).toBe("api-key-owner");
    expect(audit?.actor).not.toBe("ceo-impersonator");
  });

  it("names a real operator rather than the body-supplied name on reconcile", async () => {
    const { controller, rows } = makeRevenue();
    const operator: Principal = { id: "operator-42", role: "operator", authMethod: "api_key" };
    const created = await controller.record(
      { value: 100, provider: "amazon-associates", eventType: "commission" },
      operator,
    );
    // Cast because TypeScript now REJECTS `actor` in these bodies — which is
    // itself part of the fix. A real attacker sends raw JSON, which no type
    // checker sees, so the runtime test must still prove the value is ignored.
    await controller.reconcile(
      created.id,
      { grossAmount: 100, feeAmount: 10, costAmount: 40, actor: "not-me" } as never,
      operator,
    );
    const reconcileAudit = rows.bossAuditLog!
      .filter((r) => r.verb === "money_write")
      .at(-1);
    expect(reconcileAudit?.actor).toBe("operator-42");
    expect(reconcileAudit?.actor).not.toBe("not-me");
  });

  it("names the authenticated principal on a seller order money write", async () => {
    const { controller, rows } = makeSeller();
    const operator: Principal = { id: "seller-operator", role: "operator", authMethod: "api_key" };
    const seller = await controller.createSeller(
      { platform: "AMAZON_SELLER", displayName: "ACME" },
    );
    await controller.ingestOrder(
      {
        sellerId: seller.id,
        platform: "AMAZON_SELLER",
        externalId: "ord-1",
        totalAmount: 999,
        actor: "forged-owner",
      } as never,
      operator,
    );
    const audit = rows.bossAuditLog!.find((r) => r.verb === "money_write");
    expect(audit?.actor).toBe("seller-operator");
    expect(audit?.actor).not.toBe("forged-owner");
  });

  it("names the authenticated principal on a seller settlement money write", async () => {
    const { controller, rows } = makeSeller();
    const operator: Principal = { id: "settlement-operator", role: "operator", authMethod: "api_key" };
    const seller = await controller.createSeller(
      { platform: "AMAZON_SELLER", displayName: "ACME" },
    );
    await controller.recordSettlement(
      {
        sellerId: seller.id,
        platform: "AMAZON_SELLER",
        totalAmount: 5000,
        fees: 500,
        refunds: 0,
        cogs: 2000,
        shipping: 200,
        otherCosts: 100,
        actor: "forged-owner",
      } as never,
      operator,
    );
    const audit = rows.bossAuditLog!.find((r) => r.verb === "money_write");
    expect(audit?.actor).toBe("settlement-operator");
    expect(audit?.actor).not.toBe("forged-owner");
    // The full derivation must be recoverable from the audit row alone.
    expect(audit?.detail).toMatchObject({ cogs: 2000, shipping: 200, otherCosts: 100, profitState: "complete" });
  });
});

describe("principal resolution", () => {
  it("defaults to a non-owner principal when none is attached, never the owner", () => {
    // The decorator used to fall back to API_KEY_PRINCIPAL (role: owner), which
    // would silently promote an unattributable request to the Owner. Failing
    // closed means an unresolved identity can authorize nothing.
    expect(UNRESOLVED_PRINCIPAL.role).not.toBe("owner");
    expect(UNRESOLVED_PRINCIPAL.id).not.toBe(API_KEY_PRINCIPAL.id);
  });
});
