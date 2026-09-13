import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("reports ok", () => {
    const res = new HealthController().getHealth();
    expect(res.status).toBe("ok");
    expect(res.service).toBe("@ai-os/api");
    expect(res.database).toBe("not-checked");
  });
});