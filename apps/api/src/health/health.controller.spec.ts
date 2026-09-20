import { HealthController } from "./health.controller";

const okProbe = () => ({ $queryRawUnsafe: async () => [{ ok: 1 }] });
const downProbe = () => ({
  $queryRawUnsafe: async () => {
    throw new Error("connection refused");
  },
});

describe("HealthController", () => {
  it("reports ok when the database probe succeeds", async () => {
    const res = await new HealthController(okProbe()).getHealth();
    expect(res.status).toBe("ok");
    expect(res.service).toBe("@ai-os/api");
    expect(res.database).toBe("ok");
  });

  it("reports degraded when the database probe fails", async () => {
    const res = await new HealthController(downProbe()).getHealth();
    expect(res.status).toBe("degraded");
    expect(res.database).toBe("error");
  });
});