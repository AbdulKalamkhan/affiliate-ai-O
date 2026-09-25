# 09_DECISIONS.md

**Append-only log. Never delete an old decision — mark it superseded instead.**

## Format
```
DATE: [date]
DECISION: [what was decided]
REASON: [why]
ALTERNATIVES CONSIDERED: [if any]
STATUS: ACTIVE / SUPERSEDED (if superseded, link to the new decision)
```

## Log

DATE: (project start)
DECISION: Use AI_OS Consolidated Master Specification v5 + AI_OS_Agent_Documentation.md as canonical source of truth, superseding all earlier draft specs.
REASON: Earlier drafts had overlapping/conflicting phase numbering that would confuse a coding agent.
STATUS: ACTIVE

DATE: (project start)
DECISION: Start at PHASE-00 (Money-First MVP), not PHASE-01, regardless of how complete the full architecture documentation looks.
REASON: Avoid building months of infrastructure before proving the underlying business model converts.
STATUS: ACTIVE

DATE: (project start)
DECISION: Monorepo tool = Turborepo. Auth = NextAuth.js. Analytics dashboard (Phase 08+) = Metabase, not custom-built.
REASON: Avoid undecided/ad-hoc tooling choices that cost time later.
STATUS: ACTIVE

DATE: 2026-09-13
DECISION: Relocate AI_OS_Package delivery contents into the monorepo root (AI_CONTEXT/ now at D:\Affiliate-AI-OS\AI_CONTEXT per 02_ARCHITECTURE.md). AI_OS_Package folder removed; original AI_OS_Package.zip kept.
REASON: Deployment root is D:\Affiliate-AI-OS; the subfolder was only delivery packaging.
ALTERNATIVES CONSIDERED: Using AI_OS_Package as the repo root.
STATUS: ACTIVE

DATE: 2026-09-13
DECISION: Provision a dedicated least-privilege PostgreSQL role + database: user `aios` (LOGIN + CREATEDB, NO SUPERUSER), database `aios`, on the existing local PostgreSQL 18.4 (D:\sql). Credentials exist only in gitignored root .env.
REASON: No password was available for the `postgres` superuser; local pg_hba.conf trusts loopback connections for non-postgres roles. Never invent or guess credentials — the superuser password is recorded as a known UNKNOWN.
STATUS: ACTIVE

DATE: 2026-09-13
DECISION: Package manager = npm workspaces; Prisma 6.19.3 with prisma-client-js generator; Prisma client generated into package-local node_modules per default.
REASON: pnpm/yarn are not installed on this machine; npm workspaces + Turbo satisfy the monorepo requirement with least tooling.
STATUS: ACTIVE

DATE: 2026-09-13
DECISION: Content channel = Pinterest (Phase-00), manual publishing ONLY — no Pinterest API (SOC-04 is a later phase). Channel modeled as a config enum (`Channel.PINTEREST` on `affiliate_links`, mirrored by `CONTENT_CHANNELS` in the API) — core logic never branches on channel names.
REASON: Provider/channel-neutral + additive-architecture rule; Phase-00 proves the loop manually before automating.
ALTERNATIVES CONSIDERED: YouTube, Instagram (rejected for Phase-00 — Owner picked Pinterest).
STATUS: ACTIVE

DATE: 2026-09-13
DECISION: Content publishing has a compliance gate: `content_assets.disclosureAdded` must be true before `published` can be true; disclosure cannot be removed while published; `publishedAt` is the manual pin-go-live timestamp set by the Owner.
REASON: Amazon/FTC affiliate disclosure is a mandatory Content QA item (17_AMAZON_COMPLIANCE.md, SOC-04).
STATUS: ACTIVE

DATE: 2026-09-13
DECISION: Dashboard data is served by the API (`GET /dashboard/overview`); the web `/dashboard` page fetches it server-side. Web does not touch the database.
REASON: Single DB access boundary (API) per architecture; keeps web simple and avoids leaking DB secrets to browsers.
STATUS: ACTIVE

DATE: 2026-09-22
DECISION: Retire old inactive campaigns #1 (GIVA hoop earrings B09DGJR1Z7) and #2 (GIVA Toe Rings B09DGKCSH8). Both production drafts (link + content asset each) deleted via Owner-authenticated production session and verified by read-back (links 404, assets cascade-404, dashboard all-zero). Start a fresh campaign cycle; do NOT reuse their products, ASINs, links, assets, or Pin IDs.
REASON: Owner requested a fresh campaign cycle because previous Pinterest Pin verification was blocked (no verified per-pin evidence) and the drafts carried zero real traffic/history.
ALTERNATIVES CONSIDERED: Keep drafts as inactive/archived (no such lifecycle field exists in the schema — only DELETE is supported); agent-side cleanup (blocked — no API_KEY in agent session).
STATUS: ACTIVE

DATE: 2026-09-22
DECISION: Campaign #3 (`dhruvs-nazariya-anklet-c3`, DHRUVS COLLECTION 925 Sterling Silver Nazariya Anklet, ASIN B08BG1HC7R) is retained as the current active campaign. Reuse the verified existing affiliate link `cmucz87hk0000ah1gi1dnep0r` and content asset `cmuczfp6y0002ah1g7fjqmuxd` — do NOT create duplicate link/asset records.
REASON: Creation produced exactly one link + one asset (disclosureAdded=true, published=false). Following the HTTP 500 contract-mismatch recovery, retrying blindly would duplicate side effects; the confirmed existing records are the source of truth.
STATUS: ACTIVE

DATE: 2026-09-22
DECISION: Keep ContentAsset `published=false` for Campaign #3 until separate explicit Owner PUBLICATION approval. Pinterest publication remains a manual Owner-controlled action because Pinterest API integration is unavailable (SOC-04 later phase).
REASON: Compliance gate requires explicit go-live; no API path exists for agent-driven publication; zero clicks/traffic so far.
STATUS: ACTIVE

DATE: 2026-09-22
DECISION: Do not treat the recorded ₹1,424 price as permanently current (point-in-time listing observation). Do not mark Phase-00 as passed until a real click → conversion → commission is verified.
REASON: Prices fluctuate and commission %/outcome remain UNKNOWN without provider/network evidence.
STATUS: ACTIVE

DATE: 2026-09-25
DECISION: Campaign #3 (dhruvs-nazariya-anklet-c3, B08BG1HC7R) is fully published and LIVE (published=true, publishedAssets=1, 4 real Pinterest-attributed clicks). Enter MONEY WATCH MODE — primary objective is real Pinterest traffic → tracked click → Amazon visit → purchase → verified Associates conversion → commission evidence.
REASON: Publication record closed via Owner-authenticated PATCH; real traffic observed. Phase-00 is NOT passed on clicks alone.
ALTERNATIVES CONSIDERED: Optimizing/duplicating the campaign after only 4 clicks (rejected — no evidence basis); starting Campaign #4 (rejected — single-campaign experiment first).
STATUS: ACTIVE

DATE: 2026-09-25
DECISION: Recorded Pinterest evidence is the pin.it short URL (https://pin.it/7resx0jwa); canonical Pin ID remains UNKNOWN and is NOT to be invented or inferred.
REASON: Evidence rules forbid fabricating Pin IDs; pin.it short link does not expose the canonical /pin/<ID>/ path in accessible read-only data.
STATUS: ACTIVE

DATE: 2026-09-25
DECISION: Rate-limit per-client identity is resolved from the server-computed `req.ip` (Express `trust proxy=1` set in main.ts) FIRST, and only falls back to parsing `X-Forwarded-For` when `req.ip` is absent (unit-test requests). The raw `X-Forwarded-For` header alone is no longer trusted for identity.
REASON: A client can trivially forge `X-Forwarded-For`, so trusting it allowed the per-IP rate limit to be bypassed by rotating a spoofed value each request. `req.ip` under trust-proxy-1 is derived from the actual connection/proxy chain and is not client-controllable.
ALTERNATIVES CONSIDERED: Continuing to trust the leftmost XFF value (rejected — spoofable); trusting the rightmost XFF value (rejected — equivalent risk with client-supplied chains); removing per-client rate limiting (rejected — security regression).
STATUS: ACTIVE

DATE: 2026-09-25
DECISION: Money recording happens ONLY through the typed `RevenueModule` write path — POST /revenue-events creates a PENDING `revenue_event` (idempotent on the schema unique `[provider, sourceId]` pair); POST /revenue-events/:id/reconcile creates the `profit_record` with `netProfit = grossAmount − feeAmount − costAmount` (never treat gross as profit) and flips the event to `reconciled` (pending-only; reconciled/rejected is final); POST /revenue-events/:id/reject marks invalid evidence. Event `value` is the provider-reported commission amount; ProfitRecord carries gross/fee/cost/net + a `source` evidence reference. All endpoints sit behind the global API-key guard + rate limit.
REASON: Phase-00 scope requires "revenue/commission/profit records" but only the tables + dashboard READ path existed — without a write path there was no sanctioned way (rule 00_START_HERE: never mutate DB except via typed services) to record verified Amazon Associates conversion/commission evidence when it arrives.
ALTERNATIVES CONSIDERED: Direct DB writes by a future agent (rejected — violates architecture rule); write path gated on Owner-only manual SQL (rejected — un-scalable, unauditable); skipping the module as "later phase" (rejected — Phase-00 scope explicitly lists money records as an MVP deliverable).
STATUS: ACTIVE

DATE: 2026-09-25
DECISION: Dashboard `conversions` metric counts ONLY `reconciled` revenue events (verified conversions). Pending and `rejected` events are excluded — rejected events (invalid evidence) and unreconciled pending events are NOT conversions and must never inflate the metric. The revenue total already counted reconciled-only; the conversion count now matches that money-integrity rule.
REASON: Previously `conversions` used `revenueEvent.count()` (ALL rows) — a rejected or pending event falsely increased the count while the revenue card showed only reconciled sums, overstating business truth and contradicting the rule "a conversion is NOT automatically verified commission. An estimated commission is NOT verified commission."
ALTERNATIVES CONSIDERED: Counting all non-rejected (pending+reconciled) events (rejected — pending is not yet verified); exposing a separate pending-count field (rejected — recentRevenueEvents already surfaces per-event status).
STATUS: ACTIVE

DATE: 2026-09-25
DECISION: `GET /revenue-events/:id` includes the linked ProfitRecord (source, grossAmount, feeAmount, costAmount, netProfit, currency) so one read exposes the complete verified chain (evidence event + reconciled profit record). The dashboard's `recentRevenueEvents` and web /dashboard display the per-event `netProfit`.
REASON: ProfitRecords previously existed only as an aggregate dashboard sum — the per-event auditable breakdown (gross/fee/cost/net + evidence source) was unreachable read-only, leaving the Phase-00 "AUDIT TRAIL" lifecycle step incomplete.
ALTERNATIVES CONSIDERED: Separate GET /profit-records listing endpoint (rejected — a dedicated endpoint adds surface without new capability; the relation already links them 1:1 via revenueEventId).
STATUS: ACTIVE
