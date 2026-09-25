import { EVIDENCE_QUALITIES, SCORE_WEIGHTS } from "../opportunity-intelligence/opportunity-intelligence.service";

// Phase-02 — Research feed integration boundary (trend signals / research
// sources). Provider-neutral contract that turns an incoming RAW signal from a
// research feed into a CANONICAL, validated evidence input that the
// opportunity-intelligence engine can score.
//
// Rules enforced here (never relaxed by a feed's own labelling):
//  - a signal must state a claim and a source;
//  - the evidence quality must be one of the canonical classes, otherwise it
//    becomes UNKNOWN (and therefore contributes ZERO to any score — a trend is
//    never treated as profit);
//  - the factor must be a canonical weight-set factor;
//  - the component value must be a finite number in [0, 1].
// This file is pure I/O-free code: the actual feed ingestion is an external
// capability (Category B); the boundary itself is fully local + testable.

export interface ResearchSignal {
  source: string; // feed/provider reference (e.g. "amazon trends api 2026-09-25")
  claim: string; // what the feed said, in its own words
  factor?: string | null; // canonical ScoreFactor key, e.g. "demand", "trend"
  qualityHint?: string | null; // feed's own label, if any — reclassified here
  value?: number | null; // 0..1 component strength, if the feed provides one
}

export interface ValidatedResearchSignal {
  ok: true;
  derived: {
    claim: string;
    source: string;
    factor: keyof typeof SCORE_WEIGHTS;
    quality: (typeof EVIDENCE_QUALITIES)[number];
    value: number;
  };
}

export interface InvalidResearchSignal {
  ok: false;
  errors: string[];
}

export type ResearchSignalValidation = ValidatedResearchSignal | InvalidResearchSignal;

export const QUALITY_LABEL_ALIASES: Record<string, (typeof EVIDENCE_QUALITIES)[number]> = {
  fact: "FACT",
  observed: "FACT",
  estimate: "ESTIMATE",
  estimated: "ESTIMATE",
  approx: "ESTIMATE",
  inference: "INFERENCE",
  inferred: "INFERENCE",
  prediction: "PREDICTION",
  predicted: "PREDICTION",
  forecast: "PREDICTION",
  unknown: "UNKNOWN",
  guess: "UNKNOWN",
};

export function validateResearchSignal(signal: ResearchSignal): ResearchSignalValidation {
  const errors: string[] = [];
  const claim = typeof signal.claim === "string" ? signal.claim.trim() : "";
  const source = typeof signal.source === "string" ? signal.source.trim() : "";
  if (!claim) errors.push("claim is required");
  if (!source) errors.push("source is required");

  const factorKey = typeof signal.factor === "string" ? signal.factor.trim() : "";
  if (factorKey && !(factorKey in SCORE_WEIGHTS)) {
    errors.push(`factor must be one of: ${Object.keys(SCORE_WEIGHTS).join(", ")}`);
  }

  let quality = "UNKNOWN" as (typeof EVIDENCE_QUALITIES)[number];
  if (typeof signal.qualityHint === "string" && signal.qualityHint.trim()) {
    const hinted = signal.qualityHint.trim();
    const label = hinted.toUpperCase();
    quality = (EVIDENCE_QUALITIES as readonly string[]).includes(label)
      ? (label as (typeof EVIDENCE_QUALITIES)[number])
      : QUALITY_LABEL_ALIASES[hinted.toLowerCase()] ?? "UNKNOWN";
  }

  let value = 0.5;
  if (signal.value !== undefined && signal.value !== null) {
    if (typeof signal.value !== "number" || !Number.isFinite(signal.value) || signal.value < 0 || signal.value > 1) {
      errors.push("value must be a finite number in [0, 1]");
    } else {
      value = signal.value;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    derived: {
      claim,
      source,
      factor: (factorKey || "trend") as keyof typeof SCORE_WEIGHTS,
      quality,
      value,
    },
  };
}