import {
  conversionRate,
  conversionRateText,
  formatInr,
  formatInrCompact,
  rateText,
} from "../app/_ui/format";

describe("money-truth formatting (never fabricate)", () => {
  test("conversionRate is null unless clicks > 0 and conversions are provided", () => {
    expect(conversionRate(null, null)).toBeNull();
    expect(conversionRate(undefined, 0)).toBeNull();
    expect(conversionRate(0, 0)).toBeNull();
    expect(conversionRate(4, null)).toBeNull();
  });

  test("conversionRate reflects real recorded counts only", () => {
    expect(conversionRate(4, 0)).toBe(0);
    expect(conversionRate(4, 1)).toBe(25);
    expect(conversionRate(200, 2)).toBe(1);
  });

  test("conversionRateText keeps the honest Awaiting data state without evidence", () => {
    expect(conversionRateText(0, 0)).toBe("Awaiting data");
    expect(conversionRateText(null, null)).toBe("Awaiting data");
    expect(conversionRateText(4, undefined)).toBe("Awaiting data");
  });

  test("conversionRateText formats a real rate", () => {
    expect(conversionRateText(4, 1)).toBe("25.00%");
    expect(conversionRateText(4, 2, 1)).toBe("50.0%");
  });

  test("rateText uses the requested precision", () => {
    expect(rateText(25, 2)).toBe("25.00%");
    expect(rateText(0, 2)).toBe("0.00%");
    expect(rateText(0.5, 1)).toBe("0.5%");
  });

  test("formatInr uses en-IN grouping with exactly two decimals", () => {
    expect(formatInr(0)).toBe("₹0.00");
    expect(formatInr(1234.5)).toBe("₹1,234.50");
    expect(formatInr(255000)).toBe("₹2,55,000.00");
    expect(formatInr(255000.678)).toBe("₹2,55,000.68");
  });

  test("formatInrCompact never invents values for missing data", () => {
    expect(formatInrCompact(null)).toBe("—");
    expect(formatInrCompact(undefined)).toBe("—");
    expect(formatInrCompact(1234)).toBe("₹1,234");
    expect(formatInrCompact(1234.5)).toBe("₹1,234.5");
  });
});