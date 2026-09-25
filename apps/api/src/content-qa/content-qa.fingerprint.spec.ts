import { fingerprintContent } from "./content-qa.fingerprint";

describe("fingerprintContent", () => {
  const base = {
    title: "Sterling Silver  Nazariya  Anklet",
    description: "Disclosure: As an Amazon Associate I earn from qualifying purchases.\n\nHandcrafted 925 anklet.",
    destination: "https://www.amazon.in/dp/B08BG1HC7R?tag=zorajewellery-21",
    disclosureAdded: true,
  };

  it("is deterministic for identical content", () => {
    expect(fingerprintContent(base)).toBe(fingerprintContent(base));
  });

  it("is insensitive to whitespace/case formatting (content identity, not bytes)", () => {
    const reformatted = {
      title: "sterling silver nazariya anklet",
      description: "disclosure: as an amazon associate i earn from qualifying purchases. Handcrafted 925 anklet.",
      destination: "https://www.amazon.in/dp/B08BG1HC7R?tag=zorajewellery-21",
      disclosureAdded: true,
    };
    expect(fingerprintContent(reformatted)).toBe(fingerprintContent(base));
  });

  it("changes when the title changes", () => {
    expect(fingerprintContent({ ...base, title: "Silver Nazariya Anklet" })).not.toBe(fingerprintContent(base));
  });

  it("changes when the description is added/removed", () => {
    expect(fingerprintContent({ ...base, description: null })).not.toBe(fingerprintContent(base));
  });

  it("changes when the disclosure flag changes", () => {
    expect(fingerprintContent({ ...base, disclosureAdded: false })).not.toBe(fingerprintContent(base));
  });

  it("changes when the tagged destination changes", () => {
    expect(
      fingerprintContent({ ...base, destination: "https://www.amazon.in/dp/B08BG1HC7R?th=1&tag=zorajewellery-21" }),
    ).not.toBe(fingerprintContent(base));
  });

  it("returns a stable-length hex digest", () => {
    expect(fingerprintContent(base)).toMatch(/^[0-9a-f]{32}$/);
  });
});