// Seller Engine — provider-neutral money + listing primitives.
//
// MONEY HONESTY CONTRACT (hard rule, enforced by the profit calculator):
//   Revenue - COGS - marketplace fees - shipping - refunds - other verified costs
//   = NET PROFIT
// Any component we do not have verified evidence for is UNKNOWN, never zero.
// An UNKNOWN component makes the whole net profit UNKNOWN — we never publish a
// profit number that silently assumes missing costs were zero. `netProfit` is
// only a number when EVERY component is known.

export const UNKNOWN = "UNKNOWN" as const;
export type Unknown = typeof UNKNOWN;

export const isKnown = (value: number | Unknown | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const CURRENCY = "INR";

export interface ProfitInput {
  /** Gross sales/commission amount from verified evidence. */
  revenue: number | Unknown;
  /** Cost of goods sold. UNKNOWN when we have no verified cost. */
  cogs: number | Unknown;
  /** Marketplace commission/fees. UNKNOWN until a settlement confirms them. */
  fees: number | Unknown;
  shipping: number | Unknown;
  refunds: number | Unknown;
  otherCosts: number | Unknown;
}

export interface ProfitBreakdown {
  components: Record<keyof ProfitInput, number | Unknown>;
  unknownComponents: (keyof ProfitInput)[];
  isComplete: boolean;
  netProfit: number | null;
  currency: string;
  reason: string;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Deterministic profit calculation. Money is only ever derived from verified
 * components; a single UNKNOWN component yields `netProfit: null`.
 */
export const calculateNetProfit = (input: ProfitInput): ProfitBreakdown => {
  const components: Record<keyof ProfitInput, number | Unknown> = {
    revenue: input.revenue,
    cogs: input.cogs,
    fees: input.fees,
    shipping: input.shipping,
    refunds: input.refunds,
    otherCosts: input.otherCosts,
  };
  const unknownComponents = (Object.keys(components) as (keyof ProfitInput)[]).filter(
    (key) => !isKnown(components[key]),
  );
  if (unknownComponents.length > 0) {
    return {
      components,
      unknownComponents,
      isComplete: false,
      netProfit: null,
      currency: CURRENCY,
      reason: `net profit is UNKNOWN — missing verified: ${unknownComponents.join(", ")}`,
    };
  }
  const net = round2(
    (components.revenue as number) -
      (components.cogs as number) -
      (components.fees as number) -
      (components.shipping as number) -
      (components.refunds as number) -
      (components.otherCosts as number),
  );
  return {
    components,
    unknownComponents: [],
    isComplete: true,
    netProfit: net,
    currency: CURRENCY,
    reason: "all components verified",
  };
};

// ---------------------------------------------------------------- listings

export const LISTING_STATUSES = ["draft", "pending_approval", "live", "error", "inactive"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export interface ListingDraftInput {
  title: string;
  description?: string;
  bullets?: string[];
  attributes?: Record<string, string>;
  price?: number;
  keywords?: string[];
}

export interface ListingDraft {
  title: string;
  description: string;
  bullets: string[];
  attributes: Record<string, string>;
  keywords: string[];
  price: number | Unknown;
  validation: ListingValidation;
}

/** Restricted / policy-banned wording that must never reach a marketplace. */
export const RESTRICTED_WORDS = [
  "best seller",
  "no.1",
  "no 1",
  "guaranteed",
  "cure",
  "miracle",
  "100% genuine guarantee",
  "fda approved",
  "eco-friendly",
] as const;

export interface ListingViolation {
  field: "title" | "description" | "bullets" | "price";
  code: string;
  message: string;
}

export interface ListingValidation {
  valid: boolean;
  violations: ListingViolation[];
  unknownFields: string[];
}

const TITLE_MIN = 10;
const TITLE_MAX = 200;

const containsRestricted = (text: string): string | null =>
  RESTRICTED_WORDS.find((word) => text.toLowerCase().includes(word)) ?? null;

/**
 * Deterministic listing validation. Unknown product facts are reported as
 * `unknownFields` — the generator must never invent them.
 */
export const validateListing = (input: ListingDraftInput): ListingValidation => {
  const violations: ListingViolation[] = [];
  const unknownFields: string[] = [];

  const title = (input.title ?? "").trim();
  if (title.length < TITLE_MIN) {
    violations.push({
      field: "title",
      code: "TITLE_TOO_SHORT",
      message: `title must be at least ${TITLE_MIN} characters`,
    });
  }
  if (title.length > TITLE_MAX) {
    violations.push({
      field: "title",
      code: "TITLE_TOO_LONG",
      message: `title must be at most ${TITLE_MAX} characters`,
    });
  }
  const badTitleWord = containsRestricted(title);
  if (badTitleWord) {
    violations.push({
      field: "title",
      code: "RESTRICTED_WORD",
      message: `restricted claim "${badTitleWord}" is not allowed in a title`,
    });
  }

  const description = (input.description ?? "").trim();
  if (!description) {
    violations.push({
      field: "description",
      code: "DESCRIPTION_REQUIRED",
      message: "description is required",
    });
    unknownFields.push("description");
  } else {
    const badDescWord = containsRestricted(description);
    if (badDescWord) {
      violations.push({
        field: "description",
        code: "RESTRICTED_WORD",
        message: `restricted claim "${badDescWord}" is not allowed in a description`,
      });
    }
  }

  const bullets = input.bullets ?? [];
  if (bullets.length === 0) {
    violations.push({
      field: "bullets",
      code: "BULLETS_REQUIRED",
      message: "at least one bullet point is required",
    });
  }
  for (const bullet of bullets) {
    const bad = containsRestricted(bullet);
    if (bad) {
      violations.push({
        field: "bullets",
        code: "RESTRICTED_WORD",
        message: `restricted claim "${bad}" is not allowed in bullet points`,
      });
    }
  }

  if (input.price === undefined) {
    unknownFields.push("price");
  } else if (input.price <= 0) {
    violations.push({
      field: "price",
      code: "PRICE_INVALID",
      message: "price must be greater than zero when provided",
    });
  }

  return { valid: violations.length === 0, violations, unknownFields };
};

/**
 * Deterministic listing DRAFT builder. It only reformats verified product data
 * — it never invents a spec, a certification, or a price. Missing price stays
 * UNKNOWN so the Seller Control Center can show "Awaiting data".
 */
export const buildListingDraft = (input: ListingDraftInput): ListingDraft => {
  const title = input.title.trim();
  const description = (input.description ?? "").trim();
  const bullets = (input.bullets ?? []).map((b) => b.trim()).filter(Boolean);
  const validation = validateListing(input);
  return {
    title,
    description,
    bullets,
    attributes: input.attributes ?? {},
    keywords: (input.keywords ?? []).map((k) => k.trim()).filter(Boolean),
    price: input.price ?? UNKNOWN,
    validation,
  };
};

// --------------------------------------------------------------- inventory

export interface InventorySnapshot {
  available: number;
  reserved: number;
  sold: number;
}

export interface InventoryAdjustment {
  available: number;
  reserved: number;
  sold: number;
  reason: string;
}

export type InventoryResult =
  | { ok: true; snapshot: InventorySnapshot; delta: InventoryAdjustment }
  | { ok: false; reason: string; snapshot: InventorySnapshot };

/**
 * Inventory invariant: available can never go negative. A deduction that would
 * breach the invariant is rejected and the current snapshot is returned, so the
 * caller can record the refusal rather than corrupt stock levels.
 */
export const applyInventoryAdjustment = (
  current: InventorySnapshot,
  delta: Partial<InventoryAdjustment>,
): InventoryResult => {
  const next: InventorySnapshot = {
    available: current.available + (delta.available ?? 0),
    reserved: current.reserved + (delta.reserved ?? 0),
    sold: current.sold + (delta.sold ?? 0),
  };
  if (next.available < 0) {
    return {
      ok: false,
      reason: `insufficient available stock: have ${current.available}, requested ${Math.abs(delta.available ?? 0)}`,
      snapshot: current,
    };
  }
  if (next.reserved < 0 || next.sold < 0) {
    return {
      ok: false,
      reason: "reserved/sold quantities cannot be negative",
      snapshot: current,
    };
  }
  return {
    ok: true,
    snapshot: next,
    delta: {
      available: next.available - current.available,
      reserved: next.reserved - current.reserved,
      sold: next.sold - current.sold,
      reason: delta.reason ?? "adjustment",
    },
  };
};
