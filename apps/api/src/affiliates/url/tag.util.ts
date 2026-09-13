const ASIN_RE = /(?:dp|product|gp\/product|aw\/d)\/([A-Z0-9]{10})/i;

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
  parsed.searchParams.set("tag", tag);
  return parsed.toString();
}

export function extractAsin(rawUrl: string): string | null {
  const match = ASIN_RE.exec(rawUrl);
  return match ? match[1].toUpperCase() : null;
}