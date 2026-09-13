import { buildTaggedUrl, extractAsin } from "./tag.util";

describe("buildTaggedUrl", () => {
  it("appends tag and preserves existing query params", () => {
    const out = buildTaggedUrl("https://www.amazon.in/dp/B0EXAMPLE?th=1", "zorajewellery-21");
    expect(out.startsWith("https://www.amazon.in/dp/B0EXAMPLE")).toBe(true);
    expect(out).toContain("tag=zorajewellery-21");
    expect(out).toContain("th=1");
  });

  it("replaces an existing tag param", () => {
    const out = buildTaggedUrl("https://www.amazon.in/dp/B0XYZ?tag=oldtag&th=1", "newtag");
    expect(out).toContain("tag=newtag");
    expect(out).not.toContain("oldtag");
    expect(out).toContain("th=1");
  });

  it("rejects non-https urls", () => {
    expect(() => buildTaggedUrl("http://www.amazon.in/dp/B0XYZ", "t")).toThrow("https");
  });

  it("rejects invalid urls", () => {
    expect(() => buildTaggedUrl("not a url", "t")).toThrow("valid URL");
  });
});

describe("extractAsin", () => {
  it("extracts from /dp/ path", () => {
    expect(extractAsin("https://www.amazon.in/dp/b08n5wrwnw?th=1")).toBe("B08N5WRWNW");
  });

  it("extracts from /product/ path", () => {
    expect(extractAsin("https://www.amazon.in/product/B01ABC1234")).toBe("B01ABC1234");
  });

  it("extracts from gp/product/aw/d path", () => {
    expect(extractAsin("https://www.amazon.in/gp/product/aw/d/B09QAZWSXE")).toBe("B09QAZWSXE");
  });

  it("returns null when no asin-like part present", () => {
    expect(extractAsin("https://www.amazon.in/s?k=jewellery")).toBeNull();
  });
});