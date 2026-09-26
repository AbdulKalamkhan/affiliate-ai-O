// Phase-04 — Content QA rules engine (Content Factory: content QA + network
// compliance QA). Pure, deterministic, testable — no I/O. Evaluated server-side
// before an asset may be considered publish-ready (17_AMAZON_COMPLIANCE.md,
// 06_PHASE_GATES PATH-04 gate: assets reach publish-ready only after BOTH QA
// gates pass). Enforcement is QA-01: ContentAssetService rejects a fresh
// unpublished→published transition unless this engine says publishReady.
//
// NOTE (2026-09-26): the previous hardcoded PRE_APPROVED_PUBLISH_ASSET_IDS set
// has been REMOVED from this file. Publish exceptions are now real, auditable
// approval records in the `publish_approvals` table (see
// publish-approval.service.ts), each with an approver, timestamp and reason.
// The live Campaign #3 asset keeps working because its approval was migrated
// into that table — not because an id was hardcoded here.

export const DISCLOSURE_PATTERN =
  /((disclosure|affiliate disclosure)\s*[:.\-]|as an amazon associate\b|earn(s|ing)? from qualifying purchases)/i;

export interface QaAssetView {
  title: string;
  description: string | null;
  published: boolean;
  disclosureAdded: boolean;
  destination: string;
  hasSiblingDuplicate: boolean;
}

export interface QaCheck {
  gate: "network-compliance" | "content-quality";
  id: string;
  // 0..1 how strictly this must pass; 1 = mandatory
  weight: number;
  pass: boolean;
  reason: string;
}

export interface QaVerdict {
  checks: QaCheck[];
  networkCompliancePass: boolean;
  contentQualityPass: boolean;
  mandatoryChecksPass: boolean;
  publishReady: boolean;
  summary: string[];
}

// Claims that would be misleading without fresh evidence (17_AMAZON_COMPLIANCE:
// "No misleading price/availability claims"). A bare price/OFF/urgency token in
// copy is treated as an unsupported claim.
const PRICE_CLAIM = /(₹|rs\.?|inr|% off|discount|was )\s*\d|\d+\s*(% off|inr|rs\.?)|(last|only)\s+\d|best seller|(sold out|low stock)/i;
const FAKE_REVIEW = /\b(5-star|five star|best product|highly recommended by|customer favorite)\b/i;

const AMAZON_HOST_PATTERN = /^https:\/\/(www\.)?amazon\.(in|com)\//;

const check = (
  gate: QaCheck["gate"],
  id: string,
  weight: number,
  pass: boolean,
  reason: string,
): QaCheck => ({ gate, id, weight, pass, reason });

export function evaluateContentQa(asset: QaAssetView): QaVerdict {
  const checks: QaCheck[] = [];
  const description = asset.description ?? "";

  // --- Network Compliance QA (gate 1) ---
  checks.push(
    check(
      "network-compliance",
      "disclosure_declared",
      1,
      asset.disclosureAdded,
      asset.disclosureAdded
        ? "asset flagged as carrying disclosure"
        : "disclosureAdded is false — publisher must confirm disclosure is present",
    ),
  );
  checks.push(
    check(
      "network-compliance",
      "disclosure_sentence_present",
      1,
      DISCLOSURE_PATTERN.test(description),
      DISCLOSURE_PATTERN.test(description)
        ? "description contains a disclosure sentence"
        : "no disclosure sentence found in description (e.g. 'Disclosure: As an Amazon Associate I earn from qualifying purchases')",
    ),
  );
  checks.push(
    check(
      "network-compliance",
      "destination_https_amazon",
      1,
      AMAZON_HOST_PATTERN.test(asset.destination),
      AMAZON_HOST_PATTERN.test(asset.destination)
        ? "destination is an https amazon.in/com link"
        : "destination must be an https link to amazon.in or amazon.com",
    ),
  );
  checks.push(
    check(
      "network-compliance",
      "no_misleading_claims",
      1,
      !PRICE_CLAIM.test(description) && !PRICE_CLAIM.test(asset.title),
      !PRICE_CLAIM.test(description) && !PRICE_CLAIM.test(asset.title)
        ? "no unsupported price/availability/urgency claims"
        : "copy asserts a price, discount, stock, or best-seller claim without fresh evidence — remove or cite the source",
    ),
  );
  checks.push(
    check(
      "network-compliance",
      "no_fake_reviews",
      1,
      !FAKE_REVIEW.test(description),
      FAKE_REVIEW.test(description)
        ? "copy contains fake-review/performance language — prohibited"
        : "no fake-review language",
    ),
  );

  // --- Content Quality QA (gate 2) ---
  checks.push(
    check(
      "content-quality",
      "title_length",
      1,
      asset.title.trim().length >= 3 && asset.title.trim().length <= 100,
      asset.title.trim().length >= 3 && asset.title.trim().length <= 100
        ? `title length ${asset.title.trim().length} chars (3..100)`
        : `title length ${asset.title.trim().length} chars out of 3..100`,
    ),
  );
  checks.push(
    check(
      "content-quality",
      "description_present_when_published",
      1,
      !asset.published || description.trim().length >= 20,
      !asset.published || description.trim().length >= 20
        ? asset.published
          ? "description present with content"
          : "unpublished (description optional until publish)"
        : "published asset has no meaningful description",
    ),
  );
  checks.push(
    check(
      "content-quality",
      "no_near_duplicate",
      1,
      !asset.hasSiblingDuplicate,
      asset.hasSiblingDuplicate
        ? "another asset shares the same title+description (spam-risk / near-duplicate)"
        : "no near-duplicate sibling found",
    ),
  );

  const mandatory = checks.filter((c) => c.weight === 1);
  const networkCompliance = checks.filter((c) => c.gate === "network-compliance");
  const contentQuality = checks.filter((c) => c.gate === "content-quality");
  const networkCompliancePass = networkCompliance.every((c) => c.pass);
  const contentQualityPass = contentQuality.every((c) => c.pass);
  const mandatoryChecksPass = mandatory.every((c) => c.pass);
  const publishReady = networkCompliancePass && contentQualityPass;

  return {
    checks,
    networkCompliancePass,
    contentQualityPass,
    mandatoryChecksPass,
    publishReady,
    summary: [
      `Network Compliance QA: ${networkCompliancePass ? "PASS" : "FAIL"} (${networkCompliance.filter((c) => c.pass).length}/${networkCompliance.length})`,
      `Content Quality QA: ${contentQualityPass ? "PASS" : "FAIL"} (${contentQuality.filter((c) => c.pass).length}/${contentQuality.length})`,
      publishReady
        ? "Asset is publish-ready (both QA gates pass)."
        : "Asset is NOT publish-ready — see failed checks.",
    ],
  };
}