import {
  AUTOMATION_HANDLERS,
  automationHandler,
  automationSideEffect,
  isAutomationHandlerImplemented,
  isKnownAutomationHandler,
  listAutomationHandlers,
} from "./automation-job-registry";

describe("automation handler registry", () => {
  it("knows only declared handlers", () => {
    expect(isKnownAutomationHandler("report.daily")).toBe(true);
    expect(isKnownAutomationHandler("marketplace.sync")).toBe(true);
    expect(isKnownAutomationHandler("rm -rf")).toBe(false);
    expect(isKnownAutomationHandler("")).toBe(false);
  });

  it("is not fooled by inherited Object properties", () => {
    expect(isKnownAutomationHandler("toString")).toBe(false);
    expect(isKnownAutomationHandler("constructor")).toBe(false);
    expect(automationHandler("hasOwnProperty")).toBeNull();
  });

  it("declares report.daily as an implemented internal handler", () => {
    const handler = automationHandler("report.daily")!;
    expect(handler.sideEffect).toBe("internal");
    expect(handler.implementation).toBe("implemented");
  });

  it("declares marketplace.sync as external and NOT implemented, because no marketplace is connected", () => {
    const handler = automationHandler("marketplace.sync")!;
    expect(handler.sideEffect).toBe("external");
    expect(handler.implementation).toBe("not_implemented");
    expect(isAutomationHandlerImplemented("marketplace.sync")).toBe(false);
  });

  it("treats an unknown handler as externally side-effecting (fail-safe, not fail-open)", () => {
    expect(automationSideEffect("something.new")).toBe("external");
  });

  it("marks nothing as implemented that is not actually implemented", () => {
    for (const handler of AUTOMATION_HANDLERS) {
      if (handler.implementation === "not_implemented") {
        expect(handler.sideEffect).toBe("external");
      }
    }
  });

  it("returns a stable, sorted list for the API surface", () => {
    const first = listAutomationHandlers();
    const second = listAutomationHandlers();
    expect(first.map((h) => h.name)).toEqual([...first.map((h) => h.name)].sort());
    expect(second).toEqual(first);
  });

  it("gives every handler a reason and a required autonomy level", () => {
    for (const handler of AUTOMATION_HANDLERS) {
      expect(handler.description.length).toBeGreaterThan(10);
      expect(handler.requiredAutonomyLevel).toBeGreaterThanOrEqual(0);
    }
  });
});
