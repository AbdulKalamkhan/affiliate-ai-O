# 05_TASK_QUEUE.md

**Update this file every session — mark tasks done, add new ones.**

## Up next (Phase 00 — do these in order)
1. [x] ARCH-01 — Repository First-Boot Audit (2026-09-13) — docs-only bootstrap, no code exists; baseline recorded in 03_DEVELOPMENT_STATUS.md
2. [x] Set up Turborepo monorepo skeleton (apps/web, apps/api minimal) (2026-09-13)
3. [x] Set up PostgreSQL + Prisma, minimal schema: affiliate_links, affiliate_link_clicks, opportunities, revenue_events, profit_records (2026-09-13, migrations 20260913132220_init + 20260913135814_add_opportunities_and_product_fields)
4. [x] Simple opportunity list — `opportunities` table + CRUD via API (2026-09-13, TASK 4)
5. [x] Affiliate link generator (Associate Tag appended manually, no PA-API) + click-tracking redirect endpoint (2026-09-13, TASK 5)
6. [x] Manual publish to ONE content channel — Pinterest chosen by Owner; NO Pinterest API (SOC-04 is later phase); pins created manually via `content_assets` (2026-09-13, TASK 6)
7. [x] Minimal dashboard page showing clicks/conversions/profit (2026-09-13, TASK 7)
8. [ ] VERIFY-01 — Universal Completion Prompt before marking Phase 00 done (blocked on real conversion → verified commission evidence: Campaign #3 Pin is published and has 4 REAL clicks — pin publication is NOT the remaining blocker; awaiting Amazon Associates conversion/commission evidence for tracking ID `zorajewellery-21`. Nothing to build; Owner must supply/verify the money-loop evidence)
9. [x] REVENUE-01 — typed money-recording write path: RevenueModule (`POST /revenue-events` records pending event idempotently on [provider, sourceId]; `POST /revenue-events/:id/reconcile` → ProfitRecord netProfit=gross−fee−cost, status reconciled; `POST /revenue-events/:id/reject`; GET list/get for evidence read-back). Closes Phase-00 "revenue/commission/profit records" write-side + rule 00_START_HERE "never mutate DB except via typed services". (2026-09-25, tests 86/86, schema UNCHANGED — no migration needed). Ready for when Owner supplies verified Amazon evidence.
10. [x] PHASE-01 Boss core (OWNER EXPLICIT OVERRIDE — started BEFORE Phase-00 gate passes; override does NOT change Phase-00 evidence requirement) — Foundation & AI CEO Core: Owner command intake (`POST /boss/commands`), structured auditable plan generation (deterministic, no LLM/network), typed tool contracts with autonomy-level permission checks (boss-tools.ts), audit logs per command/plan/task/action, actions stored as PROPOSALS only (nothing executes in Phase-01). Additive Boss models (BossCommand/BossPlan/BossTask/BossAction/BossAuditLog) + migration `20260925123000_add_boss_core`. Gate "safe command → structured auditable plan without external execution" IMPLEMENTED + TESTED (2026-09-25, tests 97/97 → 100/100 after loop-10 audit-hardening fixes: update() audited, remove() soft-archives preserving trail, 4000-char text limit; typecheck/lint/build PASS, prisma validate PASS). Phase-00 UNCHANGED: BLOCKED — no fabricated evidence.

## Backlog (do not start before Phase 00 gate passes, EXCEPT owner-authorized Phase-01 work)
- PHASE-01 through PHASE-12 task prompts — see AI_OS_Agent_Documentation.md Section 12. NOTE: Phase-01 (Boss Core) STARTED 2026-09-25 under Owner explicit override (see 09_DECISIONS); owner MAXIMUM-AUTONOMY directives extended to Phase-02/03/04; FINAL COMPLETION SWEEP 2026-09-25 closed all safe local work through Phase-04.
- PHASE_01_SCOPE_ONLY (partially implemented 2026-09-25 — see 10_CHANGE_HISTORY loop-9 entry): Phase-01 = "Build Foundation + AI CEO Core after Phase 00 gate passes" — Owner command intake, boss_commands/tasks/plans/actions, typed tool contracts, permission checks, audit logs, structured plan generation. Gate: safe Owner command produces a structured, auditable plan without external execution. IMPLEMENTED + TESTED for the command→plan path. NOT STARTED for boss_approvals / boss_permissions / boss_memory / boss_tool_calls / boss_decisions tables — deferred (not needed to meet the Phase-01 gate; later Boss phases).
- PHASE_02 core (Owner MAXIMUM-AUTONOMY directive 2026-09-25 — "continue through every phase"): Phase-02 = "Build evidence-backed opportunity intelligence" — research sources/evidence, trend signals, opportunity normalization, scoring. Gate: repeatable evidence-backed ranked opportunities. CORE IMPLEMENTED + TESTED 2026-09-25: opportunity_evidence table (additive migration `20260925130000_add_opportunity_evidence`), OpportunityIntelligenceModule (POST/GET /opportunity-intelligence/opportunities/:id/evidence, GET /opportunity-intelligence/opportunities/:id/score, GET /opportunity-intelligence/ranked), deterministic versioned weight set (SCORE_WEIGHTS_VERSION=1), per-claim quality classes FACT/ESTIMATE/INFERENCE/PREDICTION/UNKNOWN with QUALITY_WEIGHT (UNKNOWN contributes 0 — trends never rank as profit). NOT STARTED: trend_signals / opportunity_signals / opportunity_scores tables, opportunity normalization beyond evidence, Affiliate-04 profit check — Category B/later (needs external research feed + verified commission evidence for estimation).
- PHASE_03 Money/Affiliate Engine — SLICE 2026-09-25 (Owner MAXIMUM-AUTONOMY directive): Revenue Consolidation/Concentration KPI (Affiliate-07) IMPLEMENTED + TESTED (RevenueService.concentration(), GET /revenue-events/concentration — only reconciled/verified events count; riskAlert when one provider >90% of verified revenue; tests 124/124). REVENUE-CONCENTRATION DASHBOARD WIDGET DONE 2026-09-25 (final sweep) — DashboardService.overview() embeds concentration; web /dashboard renders provider share + risk alerts. NOT STARTED: second-provider adapter (EXPLICITLY gated behind Money-First MVP gate per Affiliate-07), offers/campaign/commission-event entities — Category B/later.
- PHASE_04 Content Factory — SLICE 2026-09-25 (Owner MAXIMUM-AUTONOMY directive): deterministic Content QA rules engine IMPLEMENTED + TESTED (content-qa.rules.ts — 8 checks across network-compliance + content-quality gates per 17_AMAZON_COMPLIANCE; GET /content-qa/assets/:id read-only). QA-01 APPROVAL-GATE ENFORCEMENT (safe) + full verification matrix 2026-09-25 — fresh unpublished→published transitions rejected (422 + verdict) unless BOTH QA gates pass; pre-approved whitelist protects live Campaign #3; prospective-state evaluation; already-published reaffirmation = no-op never gated. NOT STARTED: content generation, image workflows, content fingerprints — Category B (external content/image APIs/pipeline).
- PHASE_05 through PHASE-12 — later phases (n8n automation, campaign analytics, CEO memory, Owner Command Center, production hardening, controlled production, scale, continuous optimization)
- Seller-01 through Seller-10 (Seller Engine) — later phase
- SOC-01 through SOC-05 (Social Media) — later phase
- N8N-01 through N8N-06 (Automation) — Phase 05+

## Completed
- 2026-09-13: ARCH-01 Repository First-Boot Audit
- 2026-09-13: Phase-00 monorepo skeleton (Turborepo + npm workspaces; apps/api NestJS, apps/web Next.js)
- 2026-09-13: PostgreSQL + Prisma schema + init migration (5 tables in db `aios`)
- 2026-09-13: TASK 4 — simple opportunity list (opportunities CRUD via API)
- 2026-09-13: TASK 5 — affiliate link generator (manual tag, no PA-API) + click-tracking redirect

## Blocker matrix — remaining work after the 2026-09-25 final sweep (Categories B/C/D)

### Moderate B — Phase-04 Content Factory remaining (content generation / image workflows / fingerprints)
TASK: Generate campaign content + images + content fingerprints (stored as assets)
STATUS: BLOCKED (B — external API/pipeline)
WHY BLOCKED: generation needs an external content/image provider (text gen, image gen, or a manual authoring pipeline); fingerprints require generated content to fingerprint
WHAT CAPABILITY/EVIDENCE: a content/image generation API or manual authoring pipeline + credentials (or Owner-supplied generated assets)
LOCAL FOUNDATION CAN STILL BE BUILT: Partially — a provider-neutral "fingerprint content" function (hash of title+description+destination) could be added once there IS stored generated content; the QA rules engine + QA-01 gate already provide the acceptance contract. Building it now = artificial (nothing to fingerprint)
OWNER ACTION: choose a generation path (AI provider, manual workflow, or external tool) and supply credentials/assets; then Phase-04 content pipeline work can close

### Moderate B — Phase-05 n8n automation / workers
TASK: repeatable workflow execution with retries, idempotency, dead-letter/error handling, notifications
STATUS: BLOCKED (B — external system)
WHY BLOCKED: n8n is an external orchestration system not present; jobs would have nothing external to drive
WHAT CAPABILITY/EVIDENCE: an n8n instance (self-hosted/cloud) + credentials + approved workflow definitions
LOCAL FOUNDATION ALREADY BUILT: YES — boss-tools.ts typed tool contracts, autonomy permission checks, evaluatePermission (granted/denied), actions-as-proposals, audit trail; the executor boundary is deliberately not implemented in Phase-01
OWNER ACTION: provision n8n + credentials; authorize Phase-05; define first workflow

### Light B — Phase-02 follow-ons (trend signals / normalization / Affiliate-04 profit check)
TASK: trend_signals/opportunity_signals/opportunity_scores tables, opportunity normalization, financial estimation (Affiliate-04)
STATUS: BLOCKED (B/C — external research feed + verified commission)
WHY BLOCKED: signal ingestion needs an external research feed (Amazon trends/social); Affiliate-04 profit estimation needs a verified commission % that does not exist yet
WHAT CAPABILITY/EVIDENCE: research feed/API or manual signal entry + verified commission % (Amazon)
LOCAL FOUNDATION CAN STILL BE BUILT: Partially — the deterministic score engine (SCORE_WEIGHTS_VERSION=1) + evidence model already define the contract; empty signal tables would be artificial
OWNER ACTION: supply commission evidence (unblocks estimation) or choose a research feed source

### Light B — Phase-03 second-provider adapter
TASK: second affiliate network adapter (Affiliate-07)
STATUS: BLOCKED (B — explicitly gated behind Money-First MVP gate)
WHY BLOCKED: Affiliate-07 rule: add the second provider only after the Money-First MVP gate (needs the first provider proven first); no second-network credentials
WHAT CAPABILITY/EVIDENCE: Amazon Associates conversion evidence for Campaign #3 (unblocks MVP gate) + second-network credentials/agreement
LOCAL FOUNDATION ALREADY BUILT: YES — provider-neutral concentration KPI, RevenueEvent provider+sourceId idempotency, network-agnostic dashboard aggregation; adapter interface pattern established by amazon-associates
OWNER ACTION: complete Phase-00 evidence; pick a second network

### C — Phase-00 business gate (critical path)
TASK: one real click → conversion → commission with real evidence (VERIFY-01)
STATUS: BLOCKED (C — external business evidence). NO FABRICATION — STATE PRESERVED TRUTHFULLY
WHY BLOCKED: Campaign #3 is live (4 real Pinterest clicks, 0 conversions, revenue ₹0, profit ₹0); a conversion/commission has not occurred or not been reported; Amazon Associates reporting for tracking `zorajewellery-21` not supplied
WHAT CAPABILITY/EVIDENCE: verified Amazon conversion + commission record (order id, ASIN, commission, date) from Owner's Associates dashboard
LOCAL FOUNDATION ALREADY BUILT: YES — RevenueModule (record pending → reconcile → ProfitRecord net = gross−fee−cost, idempotent on [provider, sourceId]) is ready end-to-end
OWNER ACTION: read Amazon Associates report for `zorajewellery-21` and supply evidence; record via POST /revenue-events → reconcile

### D — Owner-level: production access / credentials
TASK: read production data under the API key; production write actions; external provider credentials (AI, n8n, image gen, second network); future campaign decisions
STATUS: BLOCKED (D — Owner-level)
WHY BLOCKED: agent session has no API_KEY (production read-back is Owner-authenticated only); credentials for external systems unspecified; campaign expansion intentionally single-campaign experiment
WHAT CAPABILITY/EVIDENCE: API key, external credentials, campaign decisions
LOCAL FOUNDATION ALREADY BUILT: YES — security guards (API-key + rate limit), typed services, boss permission model
OWNER ACTION: optionally grant API key for autonomous read-back; supply credentials when the matching phase opens
