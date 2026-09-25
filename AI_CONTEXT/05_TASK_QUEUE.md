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
- PHASE-01 through PHASE-12 task prompts — see AI_OS_Agent_Documentation.md Section 12. NOTE: Phase-01 (Boss Core) STARTED 2026-09-25 under Owner explicit override (see 09_DECISIONS); the remaining Phase-01 additions and all later phases stay blocked on the Phase-00 money gate unless separately authorized.
- PHASE_01_SCOPE_ONLY (partially implemented 2026-09-25 — see 10_CHANGE_HISTORY loop-9 entry): Phase-01 = "Build Foundation + AI CEO Core after Phase 00 gate passes" — Owner command intake, boss_commands/tasks/plans/actions, typed tool contracts, permission checks, audit logs, structured plan generation. Gate: safe Owner command produces a structured, auditable plan without external execution. IMPLEMENTED + TESTED for the command→plan path. NOT STARTED for boss_approvals / boss_permissions / boss_memory / boss_tool_calls / boss_decisions tables — deferred (not needed to meet the Phase-01 gate; later Boss phases).
- PHASE_02 core (Owner MAXIMUM-AUTONOMY directive 2026-09-25 — "continue through every phase"): Phase-02 = "Build evidence-backed opportunity intelligence" — research sources/evidence, trend signals, opportunity normalization, scoring. Gate: repeatable evidence-backed ranked opportunities. CORE IMPLEMENTED + TESTED 2026-09-25: opportunity_evidence table (additive migration `20260925130000_add_opportunity_evidence`), OpportunityIntelligenceModule (POST/GET /opportunity-intelligence/opportunities/:id/evidence, GET /opportunity-intelligence/opportunities/:id/score, GET /opportunity-intelligence/ranked), deterministic versioned weight set (SCORE_WEIGHTS_VERSION=1), per-claim quality classes FACT/ESTIMATE/INFERENCE/PREDICTION/UNKNOWN with QUALITY_WEIGHT (UNKNOWN contributes 0 — trends never rank as profit). NOT STARTED: trend_signals / opportunity_signals / opportunity_scores tables, opportunity normalization beyond evidence, Affiliate-04 profit check (expected-revenue/commission estimation) — Phase-02 follow-ons.
- PHASE_03 Money/Affiliate Engine — later phase (provider adapters, offers, conversion reconciliation, revenue concentration KPI — partially present via RevenueModule/AffiliateModule Phase-00/01 slices)
- PHASE_04 through PHASE_12 — later phases (Content Factory, n8n automation, campaign analytics, CEO memory, Owner Command Center, production hardening, controlled production, scale, continuous optimization)
- Seller-01 through Seller-10 (Seller Engine) — later phase
- SOC-01 through SOC-05 (Social Media) — later phase
- N8N-01 through N8N-06 (Automation) — Phase 05+

## Completed
- 2026-09-13: ARCH-01 Repository First-Boot Audit
- 2026-09-13: Phase-00 monorepo skeleton (Turborepo + npm workspaces; apps/api NestJS, apps/web Next.js)
- 2026-09-13: PostgreSQL + Prisma schema + init migration (5 tables in db `aios`)
- 2026-09-13: TASK 4 — simple opportunity list (opportunities CRUD via API)
- 2026-09-13: TASK 5 — affiliate link generator (manual tag, no PA-API) + click-tracking redirect
