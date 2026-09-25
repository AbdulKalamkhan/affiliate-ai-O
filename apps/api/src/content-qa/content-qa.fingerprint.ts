import { createHash } from "node:crypto";

// Phase-04 — Content fingerprint (Content Factory "fingerprints" item).
//
// Deterministic identity hash over the real content of a content asset
// (title + description + tag-bearing destination + disclosure flag). It is
// computed from RECORDED content only — never from generated/imagined assets —
// so it is the safe local foundation for content versioning and duplicate
// detection: the same content always yields the same fingerprint regardless of
// whitespace/case formatting changes.

export interface FingerprintInput {
  title: string;
  description: string | null;
  destination: string;
  disclosureAdded: boolean;
}

const normalize = (value: string): string => value.trim().replace(/\s+/g, " ").toLowerCase();

export function fingerprintContent(input: FingerprintInput): string {
  const parts = [
    normalize(input.title),
    normalize(input.description ?? ""),
    normalize(input.destination),
    String(input.disclosureAdded),
  ];
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 32);
}