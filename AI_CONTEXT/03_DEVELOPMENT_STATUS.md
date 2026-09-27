# 03_DEVELOPMENT_STATUS.md

**This is the most important file to keep current. Update it after every session.**

## Current phase
`PHASE-00 — Money-First MVP` (in progress — scaffold, DB, opportunities, links+click tracker, Pinterest publishing wiring + dashboard done; Campaign #3 is LIVE with real clicks; only the real-conversion → verified-commission gate remains, blocked on external Amazon Associates evidence). PHASE-01 (Foundation & AI CEO Core) Gate A — "safe Owner command → structured auditable plan without external execution" — IMPLEMENTED + TESTED 2026-09-25 under OWNER EXPLICIT OVERRIDE (started before Phase-00 passes; override does NOT change Phase-00 evidence rules). PHASE-02 (Opportunity Intelligence) Gate — "repeatable evidence-backed ranked opportunities" — CORE IMPLEMENTED + TESTED 2026-09-25 under OWNER MAXIMUM-AUTONOMY directive (opportunity_evidence + deterministic versioned scoring/ranking). PHASE-03 (Money/Affiliate Engine) slice — revenue concentration KPI (Affiliate-07) IMPLEMENTED + TESTED 2026-09-25 (GET /revenue-events/concentration; second-provider adapter deferred behind Money-First MVP gate). PHASE-04 (Content Factory) slice — deterministic Content QA rules engine (network-compliance + content-quality gates, GET /content-qa/assets/:id) IMPLEMENTED + TESTED 2026-09-25. PHASE-04 QA-01 SAFE ENFORCEMENT 2026-09-25 — fresh publish transitions rejected (422 + verdict) unless BOTH QA gates pass; pre-approved whitelist protects live Campaign #3; prospective-state evaluation. PHASE-03 REVENUE-CONCENTRATION DASHBOARD WIDGET 2026-09-25 (final sweep) — overview() embeds concentration; web /dashboard renders provider share + risk alerts. PHASE-06 CAMPAIGN ANALYTICS SLICE 2026-09-25 (sweep RESTART) — GET /campaign-analytics/overview normalizes recorded evidence per campaign (links, clicks, conversions, revenue, net profit); uncategorized bucket keeps totals truthful; pending/rejected never counted; evidence-only, never infers reach. FINAL COMPLETION SWEEP 2026-09-25 — QA-01 matrix fully test-covered, local DB at 5/5 migration parity, production smoke PASS (health ok + 5 routes 401 fail-closed); blocker matrix in 05_TASK_QUEUE.

## Repository state (verified, 2026-09-13)
- Repository initialized: YES (git, branch main, at D:\Affiliate-AI-OS)
- D:\Affiliate-AI-OS root exists: YES — Turborepo monorepo (apps/*, packages/*); AI_CONTEXT moved to root per 02_ARCHITECTURE.md; AI_OS_Package delivery folder removed
- Monorepo (Turborepo) set up: YES (turbo 2.10.12, npm workspaces)
- Database connected: YES — local PostgreSQL 18.4, db `aios`, user `aios` (dedicated least-privilege role); URL in gitignored .env
- CI pipeline set up: NO (no GitHub Actions/CI on origin; remote repo exists at github.com/AbdulKalamkhan/affiliate-ai-O)

## Baseline health (verified by execution, 2026-09-13)
- Install: PASS — npm install 676 packages (turbo 2.10.12, prisma 6.19.3, next 15.5.25, nest 11)
- Typecheck: PASS — all 3 workspaces (@ai-os/web, @ai-os/api, @ai-os/database)
- Lint: PASS — all 3 workspaces
- Build: PASS — nest build + next build (production)
- Tests: PASS — @ai-os/api jest: 18 suites / 157 tests (2026-09-25: 127 at sweep-restart + 30 from the MAXIMUM-AUTONOMOUS loop-11 batch — observability filter/interceptor, provider registry + system controller, research-feed boundary, content fingerprint, command-center list-tree); database/web: no tests configured
- DB connectivity: PASS — migrations `20260913132220_init` + `20260913135814_add_opportunities_and_product_fields` + `20260913142055_add_content_assets_and_channel` + `20260925123000_add_boss_core` + `20260925130000_add_opportunity_evidence`; \dt shows affiliate_links, affiliate_link_clicks, content_assets, opportunities, opportunity_evidence, revenue_events, profit_records, boss_commands, boss_plans, boss_tasks, boss_actions, boss_audit_logs, _prisma_migrations

## Phase 00 checklist (target: 1-2 weeks)
- [x] Simple opportunity list — `opportunities` table + CRUD (TASK 4, 2026-09-13)
- [x] `affiliate_links` table + click tracker — DB + link generator + `/affiliate-links/:id/click` redirect (TASK 5, 2026-09-13)
- [x] `revenue_events` / `profit_records` tables — plus typed WRITE path added 2026-09-25 (`RevenueModule`: record pending event → reconcile to profit record → reject; Affiliate-06 boundary, see loop-7 entry)
- [x] One content channel chosen and wired — Pinterest, MANUAL publishing, no API (TASK 6, 2026-09-13; SOC-04 automation is later phase)
- [x] Manual publishing working — `content_assets` (pin title/description/destination/published/publishedAt) + disclosure gate before publish (TASK 6, 2026-09-13)
- [x] Basic dashboard showing clicks/conversions/profit — web `/dashboard` + API `/dashboard/overview` (TASK 7, 2026-09-13)
- [ ] Gate passed: at least 1 real click → conversion → commission tracked (real clicks PASSED — 4 Pinterest-attributed clicks verified 2026-09-25; conversion + verified commission still NOT VERIFIED — clicks alone do not pass the gate; awaiting Amazon Associates order evidence)

## TASK 4/5 execution evidence (2026-09-13)
- Live HTTP: opportunity create/list/patch(status→shortlisted)/delete OK; invalid status → 400 with reason; missing ids → 404.
- LIVE affiliate link: `https://www.amazon.in/gp/product/aw/d/B08N5WRWNW?th=1&psc=1` → tagged `...&tag=zorajewellery-21`, ASIN `B08N5WRWNW` extracted, manual product fields stored with NO PA-API call.
- Click tracking: `GET /affiliate-links/<id>/click` → HTTP 302 + correct `Location` header; `_count.clicks` = 1; userAgent/referrer stored truncated (≤512, no IP).
- All smoke-test rows deleted afterwards (DB clean: verified 0 rows in all business tables, 3 migrations).

## TASK 6/7 execution evidence (2026-09-13)
- Channel is CONFIG, not logic: Prisma `enum Channel { PINTEREST }` + `CONTENT_CHANNELS` list + `DEFAULT_CONTENT_CHANNEL`; link `createLink` normalizes (pinterest→PINTEREST), rejects unknown values (400). No core branch on the name.
- Content asset lifecycle (live): create (title/description/linkId) → publish without disclosure → 400 "affiliate disclosure must be added before publishing (Amazon compliance)" → set disclosure → publish OK with `publishedAt` stamped; `disclosureAdded` cannot be removed while published; unpublish clears `publishedAt`.
- Dashboard evidence (live SSR): web `/dashboard` rendered pin title "4mm Gold Chain pin", "PINTEREST", "Published pins", and metric card **Clicks = 1** fetched server-side from API `/dashboard/overview`; overview showed `{clicks:1, contentAssets:1, publishedAssets:1, clicksByChannel:{PINTEREST:1}, conversions:0, revenue:0, profit:0}`.
- Task-5 click redirect still works standalone (302 + Location) regardless of channel; channel recorded on link only.
- All smoke-test rows cleaned after each run; final psql counts all 0.
- Product-data fetch is behind `ProductDataProvider` interface (Affiliate-01 boundary). Current implementation: `manual`. PA-API adapter NOT built — slots in as a DI/provider change only.

## Blockers
- PA-API BLOCKED: Amazon Associates account `zorajewellery-21` is active for SiteStripe/manual tagging, but PA-API requires 10 qualifying sales in the trailing 30 days (account has 0). Do NOT attempt PA-API integration. Current method: manual tag appending (no PA-API call).
- Phase-00 GATE not yet met: needs at least 1 REAL click → conversion → commission. Campaign #3 real clicks exist (4, 2026-09-25) but NO conversion/commission yet — requires Owner to check Amazon Associates order/commission evidence for tracking ID `zorajewellery-21` (no evidence supplied to date).
- No AI provider configured (not a Phase-00 core-loop blocker).
- DEPENDENCY ADVISORIES (post-audit-fix, 2026-09-25): deployed-runtime multer DoS RESOLVED (platform-express 11.2.6, multer 2.4.0). Remaining 5 alerts are build/dev-time only, NOT reachable from the running API: postcss XSS/path-traversal via next (fixed only by breaking next@16 upgrade; web app not deployed, has no CSS files) and deepmerge-ts stack-exhaustion via prisma/@prisma/config (Prisma CLI-only, fixed only by prisma major). Deliberately DEFERRED to avoid breaking working architecture (per PROMPT §5); revisit when a non-breaking fix exists.
- Rate-limit identity (2026-09-25): client identity for per-IP limits now resolved from server-computed `req.ip` (trust proxy=1) FIRST — client-forged `X-Forwarded-For` can no longer rotate identities to bypass the limit; raw XFF is only a fallback for test requests without req.ip (commit 9f1256e, deployed).

## Last updated
2026-09-13 — TASK 6 (Pinterest manual-publishing wiring: `Channel` config enum, `content_assets` + disclosure/compliance gate; no API) + TASK 7 (dashboard: API `/dashboard/overview` + web `/dashboard`) done and verified live; 42 jest tests PASS; 12/12 Turbo tasks PASS

2026-09-25 — COMPLETION AUDIT: everything re-verified. Tests 56/56 (7 suites) PASS; typecheck 3/3, lint 3/3, build 3/3 PASS; production /health 200 database=ok; unauth 401 fail-closed; click route 404-on-missing intact; no TODO/FIXME placeholders; git clean on main (ahead of origin 2 docs commits). Campaign #3 published (Pin live, 4 real Pinterest clicks, 0 conversions). Phase-00 BUSINESS gate BLOCKED on external Amazon Associates evidence (Owner action).

2026-09-25 — THIRD AUTONOMOUS COMPLETION LOOP: added dashboard.service.spec.ts (5 tests) closing the last coverage gap (DashboardService.overview was the only untested service); fake-db.ts test-infra upgraded (count/aggregate/_count.select/orderBy/take/include.link, all Prisma query shapes the dashboard uses). Tests now 61/61 across 8 suites; typecheck 4/4, lint 3/3, build 3/3 PASS. No application-code change; Campaign #3 production state untouched; Phase-00 gate still BLOCKED on external Amazon Associates evidence.

2026-09-25 — FOURTH AUTONOMOUS COMPLETION LOOP: (1) `npm audit fix` cleared the deployed-runtime multer DoS family (4 advisories; platform-express 11.2.6, multer 2.4.0, next 15.5.26 — all within existing non-breaking ranges); 5 build/dev-only alerts remain (postcss via next, deepmerge-ts via prisma) → deliberately deferred (breaking-major-only fixes). (2) Rate-limit guard memory bound (unbounded window Map → 10k cap + expired-window pruning). (3) defense-in-depth tests: recordClick rejects redirects for stored destinations that are not a valid URL / not https / not an amazon host. Tests now 65/65 (8 suites); typecheck 4/4, lint 3/3, build 3/3 PASS; production /health 200 database=ok; unauth 401 fail-closed. Coverage of business/security logic >90% lines. Campaign #3 untouched; Phase-00 still BLOCKED on external Amazon Associates evidence.

2026-09-25 — FIFTH AUTONOMOUS COMPLETION LOOP: independent re-audit — migrations verified additive-only (idempotent, data-safe, `\dt` consistent), `prisma validate` PASS, no drift. Closed the last behavioral coverage gaps: (1) `AffiliateLinkService.list()` (public route) now tested — newest-first ordering + embedded `_count.clicks`; (2) `OpportunityService.update` edge cases — empty-name rejection (was uncovered line 57), trim-on-update + untouched-field preservation, null-clear of nullable fields, null-status no-op; (3) rate-limit guard X-Forwarded-For array form (first value wins); (4) server associate-tag blank-config guard. fake-db now stamps `createdAt` like real Prisma `@default(now())`. Tests now 71/71 (8 suites); typecheck 4/4, lint 3/3, build 3/3 PASS; coverage: All files 73.68% stmts / 75.57% lines, affiliate-link.service 100% lines, opportunity.service 100% lines. Production re-verified post-loop: /health 200 database=ok, /dashboard/overview 401 fail-closed, click route 404-on-missing. Campaign #3 untouched; Phase-00 still BLOCKED on external Amazon Associates evidence.

2026-09-25 — SIXTH AUTONOMOUS COMPLETION LOOP (final prompt): independent re-audit found a REAL security weakness not previously caught — RateLimitGuard keyed identity on the raw client-supplied `X-Forwarded-For` header, so a client rotating a forged header could bypass the per-IP limit entirely. Fixed: `readIp` now prefers server-computed `req.ip` (Express `trust proxy=1` configured in main.ts), falls back to XFF only for test/injected requests. +1 spoof-resistance test proving a forged XFF cannot reset the window for a fixed req.ip. Tests now 72/72 (8 suites); typecheck 4/4, lint 3/3, build 3/3 PASS; commit 9f1256e pushed + verified (local==remote); Render auto-deploy in progress/verified. No production business-data mutation; Campaign #3 untouched; Phase-00 business gate STILL BLOCKED on external Amazon Associates conversion/commission evidence.

2026-09-25 — SEVENTH AUDIT LOOP: found a REAL Phase-00 scope gap — the money-recording WRITE path did not exist. Schema + dashboard read-path (`revenue_events`/`profit_records`) were in place, but Phase-00 scope requires "revenue/commission/profit records" and rule 00_START_HERE forbids the AI from mutating the DB except through typed services, so there was NO sanctioned way to record verified Amazon conversion/commission evidence once it arrives. Implemented `RevenueModule` (apps/api/src/revenue/): `POST /revenue-events` records a PENDING event (validates positive finite value + provider; idempotent on `[provider, sourceId]` per schema unique constraint); `POST /revenue-events/:id/reconcile` computes `netProfit = grossAmount − feeAmount − costAmount`, creates the ProfitRecord (source evidence link) and flips the event to `reconciled` — pending-only, refused on already-reconciled/rejected; `POST /revenue-events/:id/reject` marks evidence invalid; `GET` list/newest-first + `GET :id` for evidence read-back. All routes protected by the global API-key guard + rate limit. Tests now 86/86 (9 suites, +14); typecheck 4/4, lint 3/3, build 3/3 PASS; prisma validate PASS (schema unchanged, no migration). Reported business evidence still has NOT been supplied — I did NOT fabricate a conversion/commission; no revenue event recorded. Campaign #3 untouched; Phase-00 gate STILL BLOCKED on external Amazon Associates evidence — but the sanctioned recording path now EXISTS and is tested and ready.

2026-09-25 — EIGHTH AUDIT LOOP (dashboard terminal-consumer + money-lifecycle verification): traced RevenueEvent → reconcile → ProfitRecord → dashboard.service.overview → web /dashboard. Found TWO genuine defects. (1) DATA-ACCURACY P2: dashboard `conversions` used `revenueEvent.count()` (ALL rows), so a REJECTED (invalid-evidence) or PENDING event inflated the "Conversions" metric while the revenue card counted only `reconciled` — inconsistent and overstated business truth. Fixed: conversions now count `{ status: "reconciled" }` only (verified conversions). (2) AUDITABILITY P2: `GET /revenue-events/:id` returned the bare event — the linked ProfitRecord (evidence source, gross/fee/cost/net) was unreachable read-only; ProfitRecords existed only as an aggregate sum. Fixed: `get` now includes `profitRecord` (full verified chain in one read); `reconcile` returns the embedded profitRecord; dashboard `recentRevenueEvents` now exposes `netProfit` per event; web /dashboard displays it and the conversions card caption reads "verified (reconciled) revenue events". fake-db gained `revenueEvent.profitRecord` include resolution. Tests now 88/88 (9 suites); typecheck 4/4, lint 3/3, build 3/3 PASS; prisma validate PASS (no schema/migration change). No fabricated business data; Campaign #3 untouched (4 clicks, 0 conversions, ₹0/₹0); Phase-00 business gate REMAINS BLOCKED on external Amazon Associates evidence.

2026-09-25 — NINTH LOOP (PHASE-01 BOSS CORE, OWNER EXPLICIT OVERRIDE): implemented the first slice of Phase-01 (Foundation & AI CEO Core) — the Owner authorized Phase-01 engineering to begin before the Phase-00 gate passes. Built `apps/api/src/boss/`: typed tool contracts with autonomy-level requirements (boss-tools.ts, per CEO operating model default 2 = prepare drafts/plans), deterministic rule-based intent classifier + permission evaluation (boss-plan-generator.ts — no LLM/network), command→plan→audit service (boss.service.ts), controller + module (all routes fail-closed behind global API-key guard + rate limit). Additive Prisma models BossCommand/BossPlan/BossTask/BossAction/BossAuditLog + migration `20260925123000_add_boss_core`; DbClient + fake-db extended (bossPlan→tasks→actions, bossTask→actions, bossCommand→plan/auditLogs). Actions are stored as PROPOSALS (permissionResult granted/denied) — Phase-01 NEVER executes a tool. Tests now 97/97 (10 suites, +9); typecheck 4/4, lint 3/3, build 3/3 PASS; prisma validate PASS. Phase-00 UNCHANGED: BLOCKED, 4 clicks, 0 conversions, revenue ₹0, profit ₹0 — nothing fabricated, no money recorded.
2026-09-25 — MAX-AUTO LOOP-11 (Owner directive: execute ALL pending work A–F): closed every safe category-A local foundation — Phase-09 observability (AllExceptionsFilter: uniform envelope, >=500 masked to serverError client-side, detail server-side; RequestLoggerInterceptor; APP_FILTER + APP_INTERCEPTOR), provider-adapter registry (/system/providers + /system/providers/:name, configured = env NAME presence only, 401 fail-closed), research-feed boundary (alidateResearchSignal — unknown quality -> 0), content fingerprint foundation (SHA-256 32-hex + ingerprint on QaEvaluation), Phase-08 Command Center read foundation (oss.service.list() embeds plan→tasks→actions + audit trail; web /command-center SSR page + home link), Phase-09 backups (docs/09_BACKUP_RESTORE.md + scripts/db-backup.mjs + db-restore-test.mjs; LOCAL RESTORE DRILL PASS — 13/13 tables, every row count matches, scratch dropped, source untouched), .env.example credential-NAMES contract. Tests now 157/157 (18 suites, +30); typecheck 4/4, lint 3/3, build 12/12 PASS; prisma validate + migrate status 5/5 PASS; local smoke: /health 200, /system/providers 401, /boss/commands 401. Phase-00 unchanged: BLOCKED, 4 clicks, 0 conversions, revenue/profit ₹0.

2026-09-26 - WEB UI LOOP (Owner MAXIMUM-AUTONOMOUS directive: premium glassmorphism for Dashboard + Command Center): delivered. apps/web/app/globals.css new design system (dark near-black base, radial/mesh gradients, translucent backdrop-blur glass cards, soft borders, restrained blue/teal accent, status pills green/amber/red/blue WITH text labels, responsive <=640px, focus-visible, prefers-reduced-motion); apps/web/app/_ui/ui.tsx shared server components (Kpi, StatusPill, Card, Panel, SectionHeading, EmptyState, UnavailableBanner, InfoBanner, ValueTag); layout.tsx sticky glass topbar (AI_OS brand + Home/Dashboard/Command Center/Campaign Analytics nav + footer); home page.tsx live system status (health/providers/key state + money KPIs + nav cards); dashboard page rewrite (Primary KPI grid: Revenue, Profit, Clicks, Conversions, Conversion Rate, Active Campaigns, Published Assets, Providers; campaign cards from real /campaign-analytics/overview; revenue concentration widget; recent links/assets/events; system area) with conversion rate only when clicks>0 else 'Awaiting data'; command-center page (commands->plans->tasks->actions permission/execution + audit trail + integrations) rendered through glass panels; NEW /campaigns Campaign Analytics page (totals KPI grid + per-campaign cards from real API data). ALL pages force-dynamic SSR, Bearer under server-side API_KEY only, never client-side; unsafe states: API down -> 'API unavailable' banner, unknown values -> 'Awaiting data'/'Not available', never a fabricated 0; Phase-00 TRUTHFULLY BLOCKED (4 clicks, 0 conversions, revenue/profit Rs0). Also cleaned 2 pre-existing api lint warnings (unused ErrorBody interface in http-exception.filter.ts; unused var in boss.service.spec.ts) - api lint now 0 warnings. Gates: web typecheck/lint/build PASS (routes /, /campaigns, /command-center, /dashboard all dynamic), full turbo 12/12 PASS (api jest 157/157, 18 suites), prisma validate + migrate status 5/5 PASS. Local prod-mode smoke: /, /dashboard, /command-center, /campaigns all 200, leak=False, fallback banners shown (no key), nav intact. Frontend deployed earlier this session (commit 58e8a6f, ai-os-web live). Commit for UI batch pending push.

## PHASE-01A / SELLER FOUNDATION — IMPLEMENTED 2026-09-26 (Owner maximum-autonomy directive)

**What is now REAL (code + tests, additive migrations only):**

- **AI CEO executor boundary** (`apps/api/src/boss/boss-executor.service.ts`): actions now progress proposed -> approval_required -> approved -> executed | failed | denied | skipped. Tool calls are recorded in `boss_tool_calls` with duration, output, error and status. Every transition writes a `boss_audit_logs` row with an `actor`.
- **Policy layer** (`boss-execution-policy.ts`): pure, deterministic. Autonomy check + terminal-state guard + mandatory Owner approval for ANY external side effect (even at autonomy 5). Deny codes: UNKNOWN_TOOL, ALREADY_TERMINAL, AUTONOMY_TOO_LOW, APPROVAL_REQUIRED, APPROVAL_PENDING, APPROVAL_REJECTED, APPROVAL_EXPIRED.
- **Tool registry truth** (`boss-tool-registry.ts`): each of the 9 typed tools declares sideEffect (none/internal/external) and implementation (implemented / not_implemented). `affiliate.publish` is honestly `not_implemented` — the executor records `skipped`, never a fake success.
- **HITL approvals** (`boss-approval.service.ts`): pending -> approved | rejected | expired, 24h default expiry, expired approvals CANNOT be approved retroactively, repeated requests are idempotent, decisions are audited with actor=owner.
- **Memory + learning foundation** (`boss-memory.service.ts`): `boss_memory` (fact/pattern/lesson/constraint, upsert-by-key), `boss_decisions` (proposal + rationale), `boss_lessons` (derived ONLY from an OBSERVED outcome; outcomes immutable). `GET /boss/learning` returns `no_data` | `waiting_outcomes` | `grounded` and a NULL groundedRatio when there is no evidence. `GET /boss/recommendations` returns `insufficient_evidence` instead of inventing advice.
- **Seller Engine foundation** (`apps/api/src/seller/`): products, product variants, listings + listing versions, inventory, orders + order items, returns, settlements, seller accounts + permissions, plus `seller_platform` enum (AMAZON_SELLER / FLIPKART_SELLER / MEESHO_SUPPLIER). 12 new tables.
- **Profit engine honesty**: revenue - COGS - fees - shipping - refunds - other = net. Any UNKNOWN component makes `netProfit` null. A settlement that omits fees/COGS is persisted but its net profit is reported as UNKNOWN, never optimistic.
- **Inventory invariants**: stock can never go negative; a rejected adjustment returns the unchanged snapshot + reason instead of corrupting levels.
- **Listing generation + validation**: deterministic draft builder with restricted-word policy, title/description/bullet/price validation, and `unknownFields` reporting. A missing price stays UNKNOWN. Drafts are versioned and NEVER auto-published.
- **Marketplace adapter architecture** (`seller/marketplace/`): provider-neutral `MarketplaceAdapter` contract (11 capabilities), capability discovery, normalized `MarketplaceError` taxonomy, guarded execution (capability support + credential check BEFORE any provider call), and three adapters: Amazon Seller Central, Flipkart Seller Hub, Meesho Supplier — all `IMPLEMENTED_NOT_CONNECTED`.
- **Global audit trail**: `boss_audit_logs.commandId` is now NULLABLE (approvals/tool-calls/decisions/lessons can be audited) and a new `actor` column records who caused each transition.

**Truth status (unchanged):** no marketplace is connected, no seller credentials exist, no LLM provider is connected, no external order was created. All three adapters report `ready_for_connection` with the exact env var names the Owner must set.

**Tests:** 233 passing across 22 API suites (was 167/20) — +66 new tests covering policy, approvals, executor lifecycle, memory/learning, profit honesty, listing validation, inventory invariants, order idempotency and adapter connectivity truth.

**Migrations (both additive, 0 destructive statements):**
- `20260926101432_add_boss_execution_and_seller_foundation` — 16 tables, 1 enum, 19 indexes
- `20260926101500_add_audit_actor_and_execution_indexes` — audit actor column, nullable commandId, 3 indexes

## MONEY INTEGRITY + APPROVAL IDENTITY + MARKETPLACE TRUTH — IMPLEMENTED 2026-09-26

**What changed (all verified by tests, all migrations additive):**

- **QA-01 publish bypass replaced by a real approval model.** New `publish_approvals`
  table (assetId, approvedBy, reason, evidence, source, grantedAt) +
  `PublishApprovalService`. The live Campaign #3 asset keeps an auditable approval
  migrated from the old hardcoded set — idempotent on boot, idempotent per asset — so
  the running campaign is never blocked, and no QA verdict was fabricated for it.
  `GET/POST /content-qa/approvals` expose the records.
- **Money paths are atomic.** `DbClient` now REQUIRES `$transaction` at the type level,
  so a multi-write money path cannot be written non-atomically. Revenue
  record/reconcile/reject and seller order ingest/settlement each write their rows and
  their audit row in ONE transaction. A failure can no longer leave an unreconciled
  profit record, a half-written order, or an unaudited money change. `reconcile()`
  re-checks pending status inside the transaction; order ingestion validates every line
  item before opening one.
- **Every money write is audited.** Revenue events, profit records, seller orders and
  seller settlements each write a `boss_audit_logs` row with `verb=money_write`, the
  actor, and the full amount breakdown.
- **UNKNOWN is no longer stored as 0.** `seller_settlements.fees`/`refunds`/`netAmount`
  are nullable and a new `profitState` column records `complete` vs `unknown`. A
  settlement that does not state every cost component stores NULL, never a false zero.
- **Approvals can no longer be spoofed.** An authenticated principal is attached by the
  API-key guard (`apps/api/src/security/principal.ts`) and read via `@CurrentPrincipal()`.
  `decidedBy` / `approvedBy` are derived from the verified credential, never from a
  request body field, and the raw key is never logged or recorded.
- **401/403/429 are now logged** (previously only 5xx was), so refused and throttled
  requests are visible without ever recording a credential.
- **`GET /seller/marketplaces` no longer conflates credentials with a connection.**
  `connected` now requires a VERIFIED live provider connection; `credentialsPresent`
  separately reports that env var NAMES are set. No adapter claims a live connection
  while its transport is unimplemented — every capability still fails with
  `NOT_CONNECTED`.

**Migrations:** `20260926110000_add_publish_approvals`,
`20260926110012_seller_settlement_unknown_safe`. `prisma migrate status` = up to date.

**Verification:** API 255/255 tests (23 suites), repo typecheck, lint, build and
`prisma validate` all green. Production still reports no marketplace, no LLM, no
automation runtime connected, and Phase-00 remains BLOCKED on genuine Amazon evidence.

**Documentation repair:** this file had been damaged by an earlier write (a shell
interpreted backslash escapes, corrupting inline code spans and em dashes). Repaired
and verified: no U+FFFD replacement characters, no escape damage, legitimate Windows
paths and `\dt` references preserved.

## AUTOMATION QUEUE + WORKER — IMPLEMENTED AND TESTED 2026-09-27

**What changed (verified by 383 API tests, live built-API probe, and `prisma migrate status`):**

- **Durable queue in the database, not a fake broker.** `AutomationJob` and
  `AutomationAttempt` tables hold the whole lifecycle: `queued -> running -> succeeded`
  or `failed`/`dead_letter`/`cancelled`, with `attemptCount`/`maxAttempts`, `runAt`
  backoff, `lockedAt`/`lockedBy` ownership, per-attempt error and duration, and an
  explicit `@@unique([handler, idempotencyKey])` index.
- **Real compare-and-swap claiming.** `claimDue` only claims a job whose status is
  still `queued` and whose `runAt` has passed, so two workers can never take the same
  job; the `status` field in the update `where` clause is the serialiser.
- **The worker is OFF by default.** `AUTOMATION_WORKER_ENABLED` must be explicitly
  `true`; otherwise `/automation/status` reports `enabled: false` and never claims a
  broker connection. No Redis, BullMQ or n8n is connected or claimed anywhere.
- **Fail-closed autonomy.** The queue ceiling comes from `AUTOMATION_AUTONOMY_LEVEL`
  and defaults to `0`, so nothing is enqueueable without explicit Owner consent. It
  is deliberately NOT inherited from Boss command history — a past command is not a
  standing grant. `/automation/status` lists which handlers are currently blocked.
- **Honest handlers only.** `report.daily` counts recorded rows and states that no
  metric was estimated; `revenue.reconcile` reports pending events and reconciles
  nothing without verified Owner evidence; `action.execute` delegates to the real
  Boss executor, which re-checks autonomy, approval and terminal action state, so
  queueing can never bypass policy. `marketplace.sync` is declared but
  `not_implemented` and dead-letters with an explicit reason rather than faking an
  external call.
- **Retry, dead letter and replay.** Retryable failures back off exponentially with
  jitter; non-retryable failures (unknown or unimplemented handler) dead-letter
  immediately WITHOUT burning the attempt budget. A reviewed dead letter can be
  replayed, which resets the budget and issues a fresh idempotency epoch.
- **Two replay idempotency defects found by the live probe and fixed.** The replay key
  was derived from the ORIGINAL idempotency key, which both (a) could collide with
  another job's already-replayed key and raise a real `P2002` against Postgres, and
  (b) produced the same key on every replay because `attemptCount` resets each time.
  Replay now uses `<jobId>#replay:<n>` from a monotonic `replayCount` column
  (migration `20260927083914_automation_job_replay_count`).
- **Idempotency holds under concurrency, not just sequentially.** Two simultaneous
  enqueues of the same `(handler, idempotencyKey)` can both miss the dedupe read; the
  database index rejects the loser with `P2002` and the service now returns the
  WINNER's job (audited as `enqueue_deduplicated`) instead of surfacing a duplicate-key
  error to a retrying client. A unique violation that is not an idempotency race is
  still rethrown rather than swallowed.
- **Stale-lock recovery AND honest graceful shutdown.** A worker that dies mid-run
  leaves a stale `running` lock that `recoverStaleLocks` reclaims after
  `LOCK_TIMEOUT_MS` (5 min). On shutdown the worker stops claiming, drains in-flight
  handlers up to `AUTOMATION_SHUTDOWN_DRAIN_MS`, and — if the deadline passes —
  explicitly releases its own locks and closes the open attempt rows as failed, so a
  job is never left falsely `running`. A CAS on `status`/`lockedBy` means a job
  another worker has taken over is left untouched.

**Migrations:** `20260927074618_automation_job_queue`,
`20260927083914_automation_job_replay_count`. `prisma migrate status` = up to date
(11 migrations).

**Endpoints:** `GET /automation/handlers|status|jobs|jobs/dead-letters|jobs/:id`,
`POST /automation/jobs`, `POST /automation/jobs/:id/replay`,
`POST /automation/worker/run-once`. All authenticated; unauthenticated requests
verified `401` against the running build.

**Live probe result (built `dist/main.js`, real PostgreSQL):** authz 401 fail-closed;
validation `400`/`403` as designed; triple enqueue `deduplicated=false,true,true` with
one row; `report.daily` succeeded with real row counts; a re-run claimed nothing;
`marketplace.sync` dead-lettered on attempt 1/3 without burning retries; replay
returned `201` with `replayCount=1` and a distinct key; replaying a non-dead-letter
returned `400`; a 2030-scheduled job stayed `queued` at `attemptCount=0`. Money tables
and `publishApprovals=1` were unchanged by the probe.

**Production verification (2026-09-27, after push `81adce6`):** the API is live at
`https://ai-os-api-1eck.onrender.com` (the host in `render.yaml` `API_BASE_URL`).
`GET /health` = 200 `{"status":"ok","service":"@ai-os/api","database":"ok"}`, and the
new `GET /automation/status` and `GET /automation/handlers` both return
`401 Invalid or missing API key` — the routes exist in the deployed build and fail
closed, which is the intended security boundary. The automation worker is NOT enabled
in production (`AUTOMATION_WORKER_ENABLED` unset), so no job is being processed there.
`AUTOMATION_AUTONOMY_LEVEL` is unset in production, so the queue ceiling is the
fail-closed default `0`.

**INFRA_NOTE:** the shorter hostname `https://ai-os-api.onrender.com` is a DIFFERENT
Render service — it answers with `x-render-origin-server: uvicorn` and returns 404
for every Nest route including `/health`. Anything pointed at that hostname is not
reaching this API. Left unchanged pending Owner direction.

**Honest gaps:** no Redis/BullMQ/n8n, no external marketplace call, no live LLM, and
the worker is not yet enabled in production. `marketplace.sync` remains
`not_implemented`. Phase-00 remains BLOCKED on genuine Amazon conversion and
commission evidence.

---

## AI_PROVIDER_BOUNDARY (P1) — IMPLEMENTED + TESTED 2026-09-27

The provider-neutral AI boundary is implemented. This is the only place in the
codebase permitted to contact a language model, and it is deliberately the whole
change: the boundary, its honesty rules, and its refusal behaviour.

**Rule 5 (AI cannot mutate business state) is enforced structurally, not by
convention.** `AiService` writes exactly one table, `ai_invocations`. A completion
can only become an effect by travelling through a typed tool, then a NestJS
service, then authorization, then business logic. Covered by a test that invokes
the boundary and asserts `revenueEvent`, `profitRecord`, `affiliateLink`,
`contentAsset`, `sellerOrder`, `sellerSettlement` and `bossAction` are all still
empty.

**Honesty rules implemented:**
1. No credential ⇒ `not_configured` ⇒ every call fails closed with
   `NOT_CONFIGURED`. There is no fabricated completion and no silent fallback to a
   stub. A provider whose credential exists is still only `configured`, never
   `verified`.
2. `verified` (and therefore `/ai/status.anyVerified`) comes from a SUCCESSFUL
   REAL CALL recorded in the database. Configuration can never set it, and the
   mock is hard-wired to never set it.
3. Cost is `null` (UNKNOWN) unless an operator supplies a price via
   `AI_MODEL_PRICES_JSON`. Vendor prices are configuration, not source: a price
   baked into a file is a claim this system cannot keep true. Same for context
   windows and output ceilings — all `null` until configured.
4. Usage token counts come from the provider's own response, or are `null`. They
   are never defaulted to `0`.
5. No secret is ever returned, logged, audited or persisted; prompts and responses
   are redacted before they are stored or forwarded.

**Adapters shipped:** `openai_compatible` (hosted vendor) and `local`
(self-hosted OpenAI-compatible server), registered under DIFFERENT names so a
local server can never be reported as the hosted vendor. `mock` is an offline
deterministic adapter, off unless `AI_ENABLE_MOCK_PROVIDER` is set. `anthropic`
and `google` are declared provider names with NO adapter: naming one fails with
`UNKNOWN_MODEL` rather than pretending. A local provider serves only the model
ids the operator lists in `AI_LOCAL_MODELS` — no model id is invented.

**Endpoint surface:** `GET /ai/status|providers|invocations|usage`,
`POST /ai/invoke`. All authenticated by the global API-key guard. `/ai/invoke`
returns ONLY a completion (`provider`, `model`, `content`, `finishReason`,
`requestId`) — no usage or cost internals reach the client. It requires a
non-viewer principal and autonomy >= 3, audited even when refused.

**Migration:** `20260927092952_ai_provider_boundary` (adds `ai_invocations`;
32 models). Applied to the configured development database; production is still
on 11 migrations until this is deployed.

**Verification (2026-09-27):** `460/460` tests in 30 suites, typecheck, lint,
root build 3/3, `prisma validate`, `prisma migrate status` (12 migrations, up to
date). Live probe of the BUILT `dist/main.js` against real PostgreSQL:
`/ai/status` unauthenticated `401`; both shipped adapters reported
`not_configured` with no credential; `/ai/invoke` refused with `403` at the
default autonomy 2 and `503 NOT_CONFIGURED` at autonomy 3; unknown provider,
missing model and empty messages each `400`; both the refused and the
not-configured attempts were audited with actor and `verified=false`; a mock
completion returned with `verified=false`; a prompt carrying an OpenAI-style key,
a connection string, a bearer token and an `api_key=` assignment was stored with
all four redacted and surrounding text intact; `/ai/usage` reported
`promptTokens/completionTokens/totalTokens/costUsd` as `null` rather than `0`.

**Bugs found and fixed during this work (all were real defects, not tests-only):**
- `AiModule` provided `AiProviderRegistry` as a class and never called
  `buildDefaultRegistry()`, so the RUNTIME registry was empty — calls failed for
  the wrong reason ("nothing registered" instead of "no credential").
- The local adapter was constructed with the hosted vendor's name, so it
  overwrote it in the registry and reported itself as `openai_compatible`.
- `AiService` threw Nest HTTP exceptions from the boundary instead of the typed
  `AiError` the interface promises; the controller now maps `AiError` to HTTP.
- `/ai/invoke` hardcoded autonomy 2 and offered no way to declare a level, so it
  could only ever return `403`; it now accepts a validated `autonomyLevel`,
  matching the existing `/boss/commands` convention.
- Unknown provider names were silently dropped to `null` (a typo could quietly
  become "use the default"); invalid input returned `200` with an error object.
- `toInt(null)` returned `0` because `Number(null) === 0`, converting UNKNOWN
  token counts into a confident `0` in `/ai/usage`.
- The redactor's patterns had no capture group, so `String.replace` passed the
  match OFFSET (and later the whole input string) into the callback, splicing
  numbers and duplicated text into redacted output. Patterns now declare
  explicitly which groups are context, split by before/after the credential. The
  original assertions (`not.toContain` the secret, `toContain "[REDACTED]"`)
  passed throughout this bug; the tests now assert exact output.

**Honest gaps:** no real LLM credential is configured, so no provider has ever
been verified and no real model output exists. `anthropic`/`google` have no
adapter. There is no per-provider rate limiting or token budget, no streaming,
no AI-generated typed tool yet (the Boss executor and tool registry exist and are
policy-enforcing; wiring an LLM to them is the next step), and
`boss-memory.service.ts` still honestly reports `llmProvider: "not_connected"`.

## MONEY TRUTH — UNKNOWN IS NOT ZERO — FIXED 2026-09-27 (commit 97f0cf3)

**What was actually wrong:** the live dashboard rendered `Revenue ₹0.00` and
`Profit ₹0.00` for a business that had never recorded a single reconciled
revenue event. This was not a display nit; it was the API asserting a
measurement it did not have.

**Root cause:** `dashboard.service.ts` coerced aggregate sums through a local
`toNumber` helper whose first line was `if (value === null || value ===
undefined) return 0`. Prisma returns `NULL` for `SUM` over zero rows *precisely
to signal that no measurement exists* — SQL agrees. One helper was silently
converting "we don't know" into "we measured zero", and the evidence-only design
that everything else in the repo defends was being undercut at the one place
the Owner actually looks.

**Fix:**
- `sumOrNull(sum, rowCount)`: money totals are `null` when there are zero
  reconciled rows, and a real `0` when rows genuinely sum to zero. The two
  cases are now distinguishable, which is the entire point.
- `campaign-analytics`: added `hasRevenueEvidence` / `hasProfitEvidence` so a
  consumer can tell a top-line 0 from no evidence. Per-campaign rows keep their
  real `0`, because "this campaign recorded no revenue" is a true statement
  about a campaign that exists — only the system-wide total lacks evidence.
- Web: `UNKNOWN_LABEL` (`"Awaiting data"`), `moneyOrUnknown`, `countOrUnknown`
  replace `?? 0`, so UNKNOWN can never render identically to a measured zero.
  Also fixed `campaigns/page.tsx`, which declared `revenue: number` while
  null-checking it — the guard was dead code that TypeScript happily accepted.

**Deliberately unchanged:** `counts` (opportunities, links, assets, clicks,
conversions, profitRecords). Those are `COUNT`s of rows we just queried, so `0`
is a genuine measurement there. Blanket-nulling counts would have been the
opposite error: replacing truth with vagueness.

**A pre-existing test was encoding the bug.** `dashboard.service.spec.ts`
asserted "reports zero counts and zero totals on an empty database" and
expected `revenue === 0`. It passed, and it was wrong. A test that pins false
behaviour is more dangerous than no test, because it actively resists the fix.
Corrected to expect `null`, plus two new tests: a recorded zero must still
report `0`, and a database with clicks but no reconciled revenue must report
UNKNOWN money.

**Verification:** 462/462 API tests (30 suites); api+web typecheck and lint
clean; root build 3/3; Prisma schema valid. Live built-runtime probe:
`/dashboard/overview` → `revenue: null, profit: null, clicks: 0, conversions: 0`
and `/campaign-analytics/overview` → `hasRevenueEvidence: false`. Rendered HTML
on `/` and `/campaigns` shows `Revenue = Awaiting data`, `Profit = Awaiting
data`, and a plain `Clicks = 0`.

## SECURITY / MONEY-INTEGRITY BATCH — PUSHED 2026-09-27 (commit 8729613)

Phase-0 audit findings closed in a single security pass.

**Authenticated identity replaces request-body actors.** `RevenueController`
(scaffold/list/reconcile/reject) and the seller money-write routes
(`ingestOrder`, `recordReturn`, `recordSettlement`) previously read an `actor`
string out of the request body, so any caller could write an audit trail
attributing their action to someone else. The actor now comes from
`CurrentPrincipal` only. Controller inline body types no longer accept `actor`,
and `audit-identity.spec.ts` posts a spoofed `actor` and proves the stored
audit row still records the authenticated principal.

**Unresolved identity fails closed.** `CurrentPrincipal` returns the
`UNRESOLVED_PRINCIPAL` sentinel for a non-owner principal instead of silently
degrading to a shared or anonymous identity. An audit row can therefore never
claim a more specific actor than the request actually proved.

**Money inputs are validated at runtime.** Settlement totals, fees, refunds,
net amount and profit state are checked for finite non-negative numbers before
persistence; `recordReturn` validates its amount and order reference. A
`NaN`/`Infinity`/negative value can no longer reach a money column.

**Returns are atomic and idempotent.** `recordReturn` performs the
read-check-write inside a transaction, so a concurrent double submission cannot
create two returns, and it refuses a return for an unknown order rather than
orphaning it. A repeated `externalId` returns the existing row instead of
duplicating a money record.

**Inventory evidence is explicit.** Inventory snapshot responses carry
`evidenceState` (`known` / `unknown`), so an unmeasured stock level is no
longer rendered as a measured zero.

**Marketplace connectivity is honest.** `not_connected` (no usable transport)
and `configured_not_verified` (credentials present, connection never proven)
are distinct states, and sync failures return a non-2xx status mapped from the
error code instead of a fabricated success payload. Credentials alone never
imply a live connection.

**Prisma CAS failure is handled.** `automation/cas.ts` now treats `P2025` as a
lost compare-and-swap rather than a generic error, and `fake-db` raises the
same no-match error real Prisma does. A mutation check (disabling the
structural `P2025` handling) fails 3 tests, and a mutation check on the actor
test fails it, so these guards are proven rather than asserted.

**Verification:** 470/470 API tests (31 suites); api typecheck, lint and build
clean; Prisma schema valid. Not yet deployed to production at the time of this
entry.

## UNIFIED ANALYTICS (P2) — IMPLEMENTED + TESTED 2026-09-27

New `apps/api/src/analytics/` module. The previous analytics surface
(`/campaign-analytics/overview`) computed correct per-campaign totals but had
no time window, no evidence state per number, and no way for a caller to tell a
measured zero from an absent measurement. This module makes that distinction
the API contract.

**Every number carries its own evidence.** Each metric is a `MetricValue`:
`value` (nullable), `evidenceState` (`known` / `unknown` / `not_configured` /
`not_connected` / `not_verified` / `not_available`), `provenance[]` (source
table, filter, `sampleSize`) and a human `note`. A `null` value always means
NO EVIDENCE and never zero. `GET /analytics/meta` publishes the contract so
the UI never hardcodes a window or a state.

**One window, echoed on every response.** `?window=today|7d|30d|90d|allTime|custom`
plus `&from=&to=&timezone=` (IANA, default `Asia/Kolkata`). `today` is local
midnight in the requested zone, not UTC midnight. Ranges are half-open
`[from, to)`, so a record at exactly `to` belongs to the next window and
adjacent windows can never double count. The resolved window is returned with
every response, so a chart and its numbers cannot be computed over different
periods. Unknown windows, unknown timezones and malformed custom ranges are
rejected with 400 rather than silently defaulted.

**Honest derived values.** A conversion rate is computed only when BOTH terms
exist (clicks > 0 AND at least one reconciled event); with clicks but no
reconciled event, or reconciled revenue but no clicks, it stays UNKNOWN rather
than collapsing to 0. `sumKnown()` refuses to total a partial breakdown: one
UNKNOWN component makes the whole total UNKNOWN.

**Seller metrics separate recorded evidence from sync coverage.** A settlement
recorded manually IS evidence and is reported as such. What is missing without
a live transport is the continuous feed, so that is reported separately as
`liveSync: not_connected` with a note that recorded figures may be incomplete.
Blanketing every seller metric as `not_connected` would have discarded real
recorded money; reporting a count as "synced" would overstate coverage.
`orders` is counted from `seller_orders` and no longer derived from the
settlement count. A settlement that leaves `fees`/`refunds`/`netAmount`
unstated makes that total UNKNOWN ("the total would be a guess"), while a
recorded `refunds: 0` remains a verified zero. COGS stays UNKNOWN because it
is asserted by the caller, not derived from a live catalogue.

**Campaign revenue is computed, not a placeholder.** It is the same reconciled
total the overview reports, so the two views cannot disagree; per-campaign
split lives in `/analytics/campaigns`. Impressions stay `not_available` — they
require a social platform API that is not connected, and are never estimated.

### Defects found and fixed while testing this module

Writing the tests surfaced four real bugs, three of them in the test
infrastructure that was hiding them:

1. **`fake-db` returned `_sum: 0` for an empty set.** Real Prisma returns
   `SUM(...) = NULL` over zero rows. The fake seeded its reduce at `0`, so it
   invented a measurement of zero — the same "UNKNOWN became 0" defect this
   codebase exists to prevent, hiding inside the double that was supposed to
   catch it.
2. **`fake-db` returned on the FIRST comparator it found.** A `{ gte, lt }`
   range therefore silently ignored its upper bound. Any window spec would have
   passed while testing nothing. Now every supplied comparator must hold.
3. **`fake-db` did not apply `@default(now())` to event timestamps.** A row
   created without an explicit `occurredAt` was left `undefined` and dropped by
   every date filter, again letting a window-scoped spec pass while measuring
   nothing.
4. **Channel and campaign clicks ignored the window.** Both used the
   all-time relation `_count`, so a "7d" heading would have displayed every
   click ever recorded — breaking the one guarantee a chart owes the reader.
   Both now use a real `groupBy` scoped to the window, with `where` omitted for
   `allTime` (treating the missing range as "no clicks" would have reported a
   false zero). A mutation check dropping that filter fails 2 tests.

Also fixed: provenance `sampleSize` was hardcoded to `0` for revenue and
commission (a provenance record that understates its own evidence), and the
`reconciledEvents` aggregate OBJECT was used as a truthiness test for evidence,
which made the "no reconciled evidence" branches dead code.

**Verification:** 503/503 API tests (32 suites) and 7/7 web tests; typecheck
4/4; lint clean; api+web builds clean; Prisma schema valid. Two mutation checks
confirm the new guards bite: dropping the window filter fails 2 tests, and
removing `MarketplaceRegistryService` from `SellerModule` exports fails the
wiring test. Phase-00 remains BLOCKED on genuine Amazon evidence; Campaign #3
untouched (1 campaign, 1 published asset, 4 clicks, 0 conversions, revenue and
profit UNKNOWN / Awaiting data).

### Production verification 2026-09-27 (commits 8729613 + f71cfcd both live)

Render auto-deploy confirmed on `ai-os-api-1eck`:

- `/health` 200, `database: ok`.
- All four new analytics routes are MOUNTED and fail closed: `/analytics/overview`,
  `/analytics/channels`, `/analytics/campaigns`, `/analytics/meta` all 401 with no
  key and 401 with a wrong key (they returned 404 before the new build, so the
  401 confirms the new module is live and the guard is holding).
- Pre-existing routes unchanged: `/dashboard/overview`,
  `/campaign-analytics/overview`, `/system/providers` all still 401.
- Web `/`, `/dashboard`, `/campaigns`, `/command-center` all 200.
- Rendered dashboard still shows the truthful values: `Clicks 4`,
  revenue/profit `Awaiting data`, no `NaN`, no `[object Object]`, and no API-key
  leak. The 27 `undefined` strings in the HTML are all inside the Next.js
  flight payload (serialized optional fields), not visible text.

Authenticated production probes of the analytics payloads remain BLOCKED: the
production `API_KEY` is not available locally, so the response BODIES were
verified in tests and by route/guard status only, never against live data.
No business data was written or changed.

## DURABLE SELLER COST LINES (P3) — IMPLEMENTED + TESTED 2026-09-27

The Phase-0 seller audit found that the components which decide net profit
(cogs, shipping, other costs) existed only inside a `boss_audit_log` JSON blob.
Three consequences: net profit could not be re-derived from the settlement
itself, COGS could never be reported at all, and a cost an operator typed was
indistinguishable from a figure the platform actually reported.

**New model `SellerSettlementLine`** (additive migration
`20260927125000_add_seller_settlement_lines`, new table only — no existing
table altered, so it cannot lose data). One row per settlement component:

- `kind` — `revenue` | `cogs` | `fees` | `shipping` | `refunds` | `other`
- `amount` — NULLABLE. NULL means the platform did not state it (UNKNOWN); it is
  never 0, and net profit stays NULL while any component is unknown.
- `source` — `platform_reported` | `asserted_by_operator` | `measured`. A cost
  an operator typed is never presented as a platform fact.
- `note` — why a component is UNKNOWN, stored with the value.

`recordSettlement` now writes all six lines inside the same transaction as the
settlement and the audit row, so a settlement can never exist without its cost
breakdown. `GET /seller/settlements/:id/lines` returns the stored lines with a
per-line `evidenceState`, so net profit can be independently re-derived or
challenged instead of taken on trust.

**Settlements are now idempotent.** `externalId` is REQUIRED (was optional): a
settlement with no platform identifier cannot be deduplicated, so a retrying
caller would silently double-count revenue. It is refused instead. A repeated
`(platform, externalId)` returns the original record with `idempotent: true` and
writes no second money row or second set of cost lines.

A unique index on `(platform, externalId)` is deliberately NOT in this
migration. Existing production duplicates cannot be ruled out without querying
the production database, and a failing index build would block deploys. The
column stays nullable in the schema because historical rows predate the
requirement. The unique index is the correct end state and should be added once
production duplicates have been checked.

**COGS is now a real metric.** `/analytics/overview` sums `kind = "cogs"` lines
filtered through the parent settlement's own `createdAt`, so it is
window-scoped. It is reported UNKNOWN — not a partial sum — unless EVERY
settlement in the window stated a COGS line, because summing a subset would
understate cost and overstate profit.

### Test-infrastructure gaps closed

- `fake-db` had no `findFirst`. It now returns the first row AFTER applying
  `orderBy`, matching Prisma: the first matching row is the first SORTED row,
  not merely the first inserted. Getting that backwards would have made the
  idempotency lookup return the wrong settlement.
- `fake-db` had no relation filtering, so a `where: { settlement: { createdAt:
  {...} } }` filter matched NOTHING. A spec asserting "COGS is a real
  measurement" would have passed while the query silently returned nothing.
  Added a child->parent relation map and threaded the row resolver through all
  eight filter call sites.
- `sellerSettlement.lines` include now honours the nested `orderBy`, so a spec
  asserting line order is not passing without the fake sorting anything.

**Verification:** 512/512 API tests (32 suites), 7/7 web, typecheck 4/4, lint
clean, api+web builds clean, Prisma schema valid. Mutation check: removing the
settlement relation mapping fails exactly the 3 COGS specs, confirming they are
not passing for free.

**Production verification (deployed at `83a30f7`):** `/health` returned 200 with
`database: ok`, and `/seller/settlements/:id/lines` returned 401 — not 404 —
which is the expected guarded result and proves the new route is registered in
the running build. Render's start command is
`prisma migrate deploy ... && node apps/api/dist/main.js`, so a healthy API is
itself evidence that migration `20260927125000` applied cleanly. Protected
response bodies still could not be read without the production `API_KEY`.

## SELLER CONTROL CENTER — IMPLEMENTED + TESTED 2026-09-27

The seller domain had a full API surface (22 routes: overview, accounts,
products, listings, inventory, orders, returns, settlements, settlement lines,
permissions, marketplace status) and no user-facing page at all. The Owner
could not see any of it.

**New page `/seller`** (`apps/web/app/seller/page.tsx`, linked in the top nav).
Read-only, server-rendered, evidence-first, consistent with the existing dark
luxury Glassmorphism. Sections: verified connections, seller accounts, listings,
inventory, orders, returns, settlements with their durable per-component cost
lines.

Deliberate truthfulness decisions, each of which would have been an easy lie:

- **Order value is only summed when ≥1 order row exists.** An empty ledger
  renders "Awaiting data", not ₹0.00.
- **Net profit is marked partial** when any settlement in the set has
  `netProfit = null`, and the KPI hint says so. A partial sum would overstate
  profit.
- **Settlement cost lines are shown per component with their `source`**, so an
  operator-typed cost is visibly different from a platform-reported one, and a
  null component renders the literal word `UNKNOWN` rather than ₹0.
- **Marketplace cards render the adapter's real `ConnectionState`**
  (`connected` / `configured_not_verified` / `ready_for_connection` /
  `not_connected`) plus missing env var names and the required Owner action, so
  the page itself documents what is blocking each integration.
- **"No orders recorded" states outright that no marketplace connection
  exists**, so the empty table cannot be misread as a demand signal.

### Honest-over-convenient API fix found while building the page

`GET /seller/overview` returned a **hardcoded `connectedMarketplaces: 0`**. On
the page that would have rendered as a measured "0 verified connections" while
credentials were present but unverified — a fact the endpoint had never
checked. `SellerService.overview()` now counts verified connections from
`MarketplaceRegistryService.status()` and adds
`configuredNotVerifiedMarketplaces`, with a status string that distinguishes
"nothing configured" from "credentials present but nothing verified" from
"N verified". The registry is an optional constructor dependency so the service
stays unit-testable with a bare fake DB client; `SellerModule` already provides
it, and the import is a sibling module so no DI cycle is introduced.

**Verification:** 514/514 API tests (32 suites), 7/7 web, typecheck 4/4, lint
clean (3/3 packages), api+web builds clean, `/seller` present in the Next build
output as a dynamic route. Two new specs cover the registry-derived connection
count and prove that credentials-present-but-unverified is never described as a
verified connection.

**Not verified:** the page's rendering against live production data still
requires the server-side `API_KEY` on the web service. Its behaviour is proven
by typecheck, build and the API contract, not by a live screenshot.

