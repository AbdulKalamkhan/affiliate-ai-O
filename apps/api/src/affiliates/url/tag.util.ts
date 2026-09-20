const ASIN_RE = /(?:dp|product|gp\/product|aw\/d)\/([A-Z0-9]{10})/i;

// Registrable Amazon domains (host must equal one exactly or be a subdomain of it,
// e.g. www.amazon.in, smile.amazon.co.uk). This is the open-redirect guard: the
// tagged destination may only ever point at Amazon.
const AMAZON_REGISTRABLE_DOMAINS = [
  "amazon.in",
  "amazon.com",
  "amazon.co.uk",
  "amazon.de",
  "amazon.fr",
  "amazon.it",
  "amazon.es",
  "amazon.ca",
  "amazon.co.jp",
  "amazon.com.au",
  "amazon.com.br",
  "amazon.com.mx",
  "amazon.sg",
  "amazon.ae",
  "amazon.nl",
] as const;

export function isAllowedAmazonHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return AMAZON_REGISTRABLE_DOMAINS.some((base) => host === base || host.endsWith(`.${base}`));
}

export function buildTaggedUrl(rawUrl: string, tag: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("url is not a valid URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("url must use https");
  }
  if (!isAllowedAmazonHost(parsed.hostname)) {
    throw new Error("url host must be an amazon domain");
  }
  parsed.searchParams.set("tag", tag);
  return parsed.toString();
}

export function extractAsin(rawUrl: string): string | null {
  const match = ASIN_RE.exec(rawUrl);
  return match ? match[1].toUpperCase() : null;
}