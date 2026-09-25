import { validateResearchSignal } from "./research-feed.provider";

describe("validateResearchSignal", () => {
  it("accepts a well-formed FACT signal and maps it into canonical evidence", () => {
    const result = validateResearchSignal({
      source: "amazon trends api 2026-09-25",
      claim: "search demand rose 40% for 'nazariya anklet'",
      factor: "demand",
      qualityHint: "fact",
      value: 0.9,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.derived.quality).toBe("FACT");
      expect(result.derived.factor).toBe("demand");
      expect(result.derived.value).toBe(0.9);
      expect(result.derived.claim).toBe("search demand rose 40% for 'nazariya anklet'");
    }
  });

  it("reclassifies a feed's own loose label through the alias table", () => {
    const r1 = validateResearchSignal({ source: "s", claim: "c", factor: "trend", qualityHint: "Estimate" });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.derived.quality).toBe("ESTIMATE");

    const r2 = validateResearchSignal({ source: "s", claim: "c", factor: "trend", qualityHint: "we guess" });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.derived.quality).toBe("UNKNOWN"); // guess == UNKNOWN contributes zero
  });

  it("defaults missing quality to UNKNOWN so a bare trend can never score as profit", () => {
    const result = validateResearchSignal({ source: "s", claim: "c", factor: "trend" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.derived.quality).toBe("UNKNOWN");
  });

  it("rejects a missing claim or source", () => {
    const missingClaim = validateResearchSignal({ source: "s", claim: "  " });
    expect(missingClaim.ok).toBe(false);
    if (!missingClaim.ok) expect(missingClaim.errors).toContain("claim is required");

    const missingSource = validateResearchSignal({ source: "", claim: "c" });
    expect(missingSource.ok).toBe(false);
    if (!missingSource.ok) expect(missingSource.errors).toContain("source is required");
  });

  it("rejects a factor outside the canonical weight set", () => {
    const result = validateResearchSignal({ source: "s", claim: "c", factor: "vibes", qualityHint: "fact" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("factor must be one of");
      expect(result.errors[0]).toContain("demand");
    }
  });

  it("rejects an out-of-range or non-finite component value", () => {
    const tooBig = validateResearchSignal({ source: "s", claim: "c", factor: "trend", value: 2 });
    expect(tooBig.ok).toBe(false);
    const nan = validateResearchSignal({ source: "s", claim: "c", factor: "trend", value: Number.NaN });
    expect(nan.ok).toBe(false);
  });

  it("defaults factor to trend and value to 0.5 when the feed omits them", () => {
    const result = validateResearchSignal({ source: "s", claim: "c" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.derived.factor).toBe("trend");
      expect(result.derived.value).toBe(0.5);
    }
  });
});