# 11_AI_MEMORY.md

**This is CEO Memory — what the system has learned from real execution. Not the same as 09_DECISIONS.md (architectural decisions) — this file is business/campaign learning.**

## Format per entry
```
DATE: [date]
CONTEXT: [opportunity/campaign/listing this relates to]
EXPECTED: [what was predicted]
ACTUAL: [what happened]
EVIDENCE QUALITY: FACT / ESTIMATE / INFERENCE / PREDICTION / UNKNOWN
LESSON: [what to do differently / reuse next time]
REUSABLE: YES/NO
```

## Log

DATE: 2026-09-22
CONTEXT: Old inactive Campaign #1 (GIVA hoop earrings B09DGJR1Z7) and Campaign #2 (GIVA Toe Rings B09DGKCSH8) — draft/unpublished production records
EXPECTED: Drafts with 0 real traffic could be safely removed ahead of a fresh campaign cycle
ACTUAL: Both production links + assets deleted and VERIFIED (both link IDs HTTP 404; assets cascade-404; dashboard all-zero: affiliateLinks 0, contentAssets 0, publishedAssets 0, clicks 0, conversions 0, revenue/profit ₹0, opportunities 0, profitRecords 0). Pinterest UNCHANGED. Campaign #3 NOT created. Cleanup required an Owner-authenticated production session (Agent has no API_KEY; key stayed private).
EVIDENCE QUALITY: FACT
LESSON: DRAFTS WITHOUT REAL TRAFFIC AND WITHOUT VERIFIED PUBLICATION CARRY NO BUSINESS VALUE AND NO HISTORY — deleting them loses nothing; production read-back (404 + dashboard all-zero) is mandatory before recording cleanup. Agent must never claim deletion without read-back and must never request/expose the API key.
REUSABLE: YES

DATE: 2026-09-22
CONTEXT: Campaign #3 (dhruvs-nazariya-anklet-c3, ASIN B08BG1HC7R) creation + content-asset HTTP 500 recovery
EXPECTED: Link + asset could be created in one pass after Owner approval
ACTUAL: Affiliate link cmucz87hk0000ah1gi1dnep0r created successfully; first content-asset POST returned HTTP 500 (CLIENT/API CONTRACT MISMATCH — `affiliateLinkId` supplied instead of required `linkId`). Read-only reconciliation (affiliateLinks=1, contentAssets=0) prevented a duplicate-link retry; corrected request reusing the existing link ID created asset cmuczfp6y0002ah1g7fjqmuxd. VERIFIED: disclosureAdded=true, published=false, destination Amazon ASIN B08BG1HC7R with server-managed tag, dashboard affiliateLinks=1/contentAssets=1/publishedAssets=0/clicks=0/conversions=0/revenue ₹0/profit ₹0, Pinterest UNCHANGED.
EVIDENCE QUALITY: FACT
LESSON 1: Campaign #3 creation required the ContentAsset API field `linkId`. LESSON 2: Before retrying a failed API mutation, reconcile production state first to prevent duplicate side effects. LESSON 3: A successful affiliate-link creation followed by asset failure can leave a partial production state; retry ONLY the missing resource after read-back. GOVERNANCE: NEVER rerun a side-effecting creation script blindly after partial failure.
REUSABLE: YES

DATE: 2026-09-22
CONTEXT: Campaign #3 (dhruvs-nazariya-anklet-c3, B08BG1HC7R) — post-creation state
EXPECTED: N/A (state record)
ACTUAL: Campaign #3 was created UNPUBLISHED (published=false, disclosureAdded=true) with ZERO clicks/conversions/revenue. Recorded price ₹1,424 is point-in-time, not a current guarantee. Commission percentage and commission outcome REMAIN UNKNOWN until supported by provider/network evidence.
EVIDENCE QUALITY: FACT (superseded 2026-09-25 by publication — see next entry)
LESSON: Do not treat recorded price or commission as current/verified; keep published=false until separate explicit Owner publication approval; Phase-00 money gate is NOT passed without a real click → conversion → commission.
REUSABLE: YES

DATE: 2026-09-25
CONTEXT: Campaign #3 (dhruvs-nazariya-anklet-c3, B08BG1HC7R) — publication recorded + live traffic
EXPECTED: Publication record + monitoring
ACTUAL: Owner executed authenticated PATCH → published=true (verified by Owner read-back); Pin live https://pin.it/7resx0jwa (canonical Pin ID UNKNOWN — not invented); REAL Pinterest-attributed clicks=4, conversions=0, revenue ₹0, commission UNKNOWN. PublishedAssets=1. Money watch mode starts.
EVIDENCE QUALITY: FACT (production read-back); external Pin verification read-only PASS via rendered pin.it page; canonical Pin ID NOT AVAILABLE.
LESSON: Clicks alone do NOT satisfy Phase-00 — real conversion + commission evidence required. No test clicks. No Campaign #4 without evidence.
REUSABLE: YES

DATE: 2026-09-25
CONTEXT: Click-detail visibility for Campaign #3
EXPECTED: Verify the 4 click records read-only
ACTUAL: NO read-only click-record endpoint exists (dashboard/affiliate-links expose aggregate counts only; `AffiliateLinkClick` rows with id/timestamp are never serialized). Agent-side authenticated GET is impossible without API_KEY (fail-closed 401).
EVIDENCE QUALITY: FACT
LESSON: Click-level detail requires a future authenticated endpoint or direct DB query; do not create endpoints/schema changes during money-watch without Owner request.
REUSABLE: YES

DATE: 2026-09-25
CONTEXT: Autonomous COMPLETION AUDIT — verify everything before reporting final state
EXPECTED: Confirm engineering state and reconcile memory
ACTUAL: All gates green: tests 56/56 (7 suites), typecheck 3/3, lint 3/3, build 3/3; production /health 200 database=ok; unauth 401 fail-closed; GET /affiliate-links/:id/click on missing id = 404 (public route intact, not 401); no TODO/FIXME placeholders in repo; git clean on main, ahead of origin by 2 documentation commits (2aa304f, d385794) NOT pushed — push only if Owner asks. Memory reconciled: 03/05/06/MASTER cleared of stale claims (hardened build IS deployed and verified; remote GitHub repo exists; 56 not 42 tests; real traffic 4 clicks exists; remaining blocker is external Amazon Associates conversion/commission evidence, NOT pin publication).
EVIDENCE QUALITY: FACT (executed gates + production read-only probes)
LESSON: Phase-00 engineering is complete and production-verified; the money gate cannot be passed by any further engineering — it is BLOCKED_ON_EXTERNAL_EVIDENCE. Final state: ENGINEERING_COMPLETE=TRUE, PRODUCTION_STATE=VERIFIED, BUSINESS_GATE=BLOCKED_ON_EXTERNAL_EVIDENCE, MONEY_LOOP=INCOMPLETE, PHASE_00=NOT_PASSED. Owner must supply real Amazon Associates order/commission evidence.
REUSABLE: YES

DATE: 2026-09-25
CONTEXT: THIRD AUTONOMOUS COMPLETION LOOP — closing the last dashboard coverage gap
EXPECTED: Verify no remaining safe in-scope engineering work
ACTUAL: Found DashboardService.overview (the Phase-00 money dashboard, 55 lines of real aggregation logic) had ZERO test coverage — the only service without a spec. Added dashboard.service.spec.ts (5 tests) covering empty zero-state, counts incl publishedAssets filter, clicks-by-channel aggregation, reconciled-only revenue + profit summing (pending/rejected correctly excluded), newest-5 ordering with embedded _count. Upgraded fake-db.ts test-infra to support count({where}), aggregate(_sum/where), findMany orderBy/take/select-with-_count/include.link. Gates re-run ALL PASS: api jest 61/61 (8 suites, +5), typecheck 4/4, lint 3/3, build 3/3. NO application-code change; NO schema/migration change; Campaign #3 production state untouched (still 4 clicks, 0 conversions, Phase-00 NOT PASSED).
EVIDENCE QUALITY: FACT (executed gates; domain logic assertions)
LESSON: "No remaining work" claims must be proven by coverage, not by reading — the dashboard (a Phase-00 deliverable) was untested until this loop; drive untested modules to green with faithful fake-DB specs before declaring completion. Fake-DB must mirror Prisma query shapes (_count, aggregate, include.link) to make such tests possible.
REUSABLE: YES

DATE: 2026-09-25
CONTEXT: FOURTH AUTONOMOUS COMPLETION LOOP — dependency audit, rate-limit memory bound, click-redirect defense-in-depth tests
EXPECTED: Re-audit for anything still safely fixable in-scope
ACTUAL: (1) npm audit (2026-09-25): 7 alerts → multer DoS family (4, in the DEPLOYED API runtime) cleared by non-breaking `npm audit fix` (platform-express 11.2.5→11.2.6, multer 2.2.0→2.4.0, next 15.5.25→15.5.26, all within existing package.json ranges — lockfile-only change). Remaining 5 = build/dev-time only (postcss XSS/path-traversal via next — only fixed by BREAKING next@16; web not deployed/no CSS; deepmerge-ts stack-exhaustion via prisma CLI). Deferred deliberately; recorded as residual in 03. (2) Found + fixed a real P2 reliability defect: rate-limit.guard.ts window Map was UNBOUNDED — one entry per method+client per 60s, never evicted → memory grows under spoofed/high-cardinality client traffic; added MAX_WINDOWS=10,000 + pruneExpired(). (3) Closed defense-in-depth test gap: recordClick stored-destination rejects (not-a-URL / non-https / non-Amazon host) now covered (previously uncovered lines). Tests 61→65/65; typecheck/lint/build PASS; production /health 200 database=ok; unauth 401 fail-closed.
EVIDENCE QUALITY: FACT (executed gates + prod read-only probes + npm audit)
LESSON 1: An unbounded per-client in-memory cache/key store is a P2 memory-safety defect even when correct in steady state — always cap + sweep on size. LESSON 2: Security-mandatory branches (redirect destination re-validation) MUST have behavioral tests even though they duplicate defense; coverage of security boundaries > convenience. LESSON 3: Distinguish "vulnerable dependency in the deployed runtime" (fix now, non-breaking) from "vulnerable build/dev tooling" (defer breaking majors; record residual) — never force a breaking upgrade just to zero an audit count.
REUSABLE: YES

DATE: 2026-09-25
CONTEXT: FIFTH (FINAL) AUTONOMOUS COMPLETION LOOP — close last behavioral coverage gaps + make test ordering faithful
EXPECTED: Confirm nothing safe remains in-scope without inventing tasks
ACTUAL: Found 4 real behavioral gaps and closed them: (1) AffiliateLinkService.list() (public route) was UNTESTED — added newest-first + embedded _count.clicks test. (2) OpportunityService.update edge cases (empty-name 400, trim-on-update preserving untouched fields, null-clear of nullable fields, null-status no-op). (3) rate-limit guard X-Forwarded-For array form (first-wins) branch. (4) server associate-tag blank-config guard. Also made fake-db.ts stamp createdAt when absent (mirrors Prisma @default(now())) so ordering assertions are faithful to real behavior, not test-convenience. Migrations re-audited read-only: all additive-only / idempotent / data-safe; prisma validate PASS, no drift. Gates: api jest 71/71 PASS (8 suites, +6), typecheck 4/4, lint 3/3, build 3/3. Coverage All files 73.68% stmts / 75.57% lines; affiliate-link.service + opportunity.service 100% lines. Production /health 200 database=ok (2026-09-25T08:36Z), 401 fail-closed intact, click 404-on-missing intact. Campaign #3 untouched (still 4 clicks, 0 conversions, Phase-00 NOT PASSED).
EVIDENCE QUALITY: FACT (executed gates + prod read-only probes + prisma validate)
LESSON 1: "Untested public route" is a genuine residual gap even when everything else is green — audit by route→handler→spec trace, not by coverage headline. LESSON 2: A test fake that omits a real DB default (createdAt@now) silently weakens ordering assertions — fakes must mirror Prisma defaults, not just accepted query shapes. LESSON 3: A truly final loop is marked by finding only micro-gaps (branch coverage on defensive paths), after which remaining work is genuinely external (Amazon evidence). Do not fabricate further tasks.
REUSABLE: YES

DATE: 2026-09-25
CONTEXT: SIXTH AUTONOMOUS COMPLETION LOOP — rate-limit identity spoofing
EXPECTED: Final loop would find only micro-gaps; security already hardened across prior loops
ACTUAL: Found a REAL P2 security weakness: RateLimitGuard derived per-client identity from the raw client-supplied `X-Forwarded-For` header (first value), so any client rotating a forged header each request could bypass the per-IP limit (60 GET / 10 mutate per window) entirely. Fixed readIp to prefer Express-computed `req.ip` (main.ts sets trust proxy=1) and only fall back to header parsing for requests without req.ip. Added spoof-resistance test: fixed req.ip + forged XFF still hits the limit (identity NOT reset by the spoofed header). Gates: api jest 72/72 (8 suites, +1), typecheck 4/4, lint 3/3, build 3/3 PASS; commit 9f1256e pushed, local==remote, tree clean.
EVIDENCE QUALITY: FACT (reproduced bypass reasoning, verified fix behavior by test + full gates)
LESSON 1: Never derive security-relevant identity (rate-limit keys, per-user state) from client-forgeable headers when the framework already resolves an authoritative value (Express req.ip under trust proxy). Header parse should be a fallback only. LESSON 2: Header-shape tests (string/comma/array) passing ≠ spoof-safe; a dedicated adversarial identity test is required. LESSON 3: Even an "everything is green" final loop can surface a genuine defect — re-audit with an adversarial mindset, not just coverage numbers.
REUSABLE: YES

DATE: 2026-09-25
CONTEXT: SEVENTH AUDIT LOOP — the money-recording WRITE path was missing
EXPECTED: "No in-scope engineering remains" after six loops
ACTUAL: Found a REAL Phase-00 scope gap, not manufactured work: `revenue_events`/`profit_records` tables + dashboard READ path existed, but Phase-00 scope ("revenue/commission/profit records") combined with rule 00_START_HERE (AI never mutates the DB except through typed services) required a typed WRITE path — and none existed. Implemented RevenueModule: POST /revenue-events (PENDING event, idempotent on [provider, sourceId]), POST /revenue-events/:id/reconcile (ProfitRecord netProfit=gross−fee−cost, status→reconciled, pending-only), POST /revenue-events/:id/reject, GET list/get. Tests 86/86 (9 suites, +14); typecheck/lint/build PASS; prisma validate PASS; schema UNCHANGED (no migration). IMPORTANT: reported Amazon evidence was searched for and NOT found — NO conversion/commission was fabricated or recorded; the path is now TESTED and READY for when the Owner supplies real evidence.
EVIDENCE QUALITY: FACT (executed gates; code + spec + doc cross-check)
LESSON 1: After an "all green, nothing to build" verdict, re-audit the WRITE side of every Phase-00 deliverable explicitly (create/reconcile/reject/read) — readers (like the dashboard) existing does not prove a sanctioned writer exists. LESSON 2: Money-integrity invariants (positive value, pending-only reconcile, netProfit=gross−fee−cost, idempotent source dedup) belong in the service, verified by tests, not left to callers. LESSON 3: Never record money events without real evidence; build the tested path, deploy it, and keep the gate blocked on evidence.
REUSABLE: YES

DATE: 2026-09-25
CONTEXT: EIGHTH AUDIT LOOP — dashboard terminal-consumer verification exposed 2 money-integrity defects
EXPECTED: Terminal consumer (web /dashboard consuming dashboard.service.overview) was already "correct" after loop 7
ACTUAL: Found 2 genuine defects. (1) `conversions` counted ALL revenue events (revenueEvent.count()) including REJECTED and PENDING — but the revenue card counted only `reconciled`; a rejected/invalid-evidence event thus inflated "Conversions", overstating business truth and contradicting "a conversion is NOT automatically verified commission". Changed to `count({where:{status:"reconciled"}})`. (2) ProfitRecords were unreachable per-event read-only (only aggregate sum on dashboard) — GET /revenue-events/:id now includes the linked ProfitRecord, reconcile returns it embedded, dashboard recentRevenueEvents expose netProfit, web shows "profit ₹X" per reconciled event. fake-db resolves revenueEvent.profitRecord include. Tests 88/88 (9 suites); typecheck/lint/build PASS; prisma validate PASS. No fabricated data; Campaign #3 untouched.
EVIDENCE QUALITY: FACT (traced chain RevenueEvent→reconcile→ProfitRecord→dashboard.service.overview→web page; behavioral spec assertions)
LESSON 1: "Conversions" must follow the same money-integrity rule as revenue — count only VERIFIED (reconciled); never let pending/rejected inflate a money metric. LESSON 2: Aggregate consumers (dashboard sums) can hide the absence of a per-record audit read; verify each stage of the lifecycle is Read-accessible, not just Sum-mable. LESSON 3: A terminal consumer verification means TRACING the full chain end-to-end, not just confirming the page renders.
REUSABLE: YES

DATE: 2026-09-25
CONTEXT: NINTH LOOP — Phase-01 Boss core under Owner explicit override (Phase-00 still BLOCKED)
EXPECTED: Phase-01 engineering was previously gated behind the Phase-00 money gate (05_TASK_QUEUE lock)
ACTUAL: Owner explicitly overrode the Phase-00 gate ordering and authorized Phase-01 (Foundation & AI CEO Core) to begin. Implemented the command→plan slice that meets the Phase-01 gate ("safe Owner command → structured, auditable plan WITHOUT external execution"): typed tool contracts with autonomy levels (boss-tools.ts), deterministic rule-based intent classification + permission evaluation (boss-plan-generator.ts — no LLM/network), BossService (command intake → BossPlan objective + ordered BossTask + proposed BossAction with permissionResult → command planned → BossAuditLog trail), Boss controller/module, additive migration `20260925123000_add_boss_core` (boss_commands/plans/tasks/actions/audit_logs). Actions stored as PROPOSALS only; `affiliate.publish` (requiredAutonomy 4) correctly DENIED at default autonomy 2. Tests 97/97 (10 suites); typecheck/lint/build/prisma validate PASS. Phase-00 UNCHANGED: BLOCKED, 4 clicks, 0 conversions, revenue ₹0, profit ₹0 — nothing fabricated.
EVIDENCE QUALITY: FACT (executed gates; behavioral spec assertions incl permission denial/grant)
LESSON 1: An Owner override to start a later phase does NOT change an earlier phase's evidence gate — keep Phase-00 blocked and un-fabricated while Phase-01 proceeds. LESSON 2: Meet a phase gate with the SMALLEST deterministic truthful implementation — deterministic rule-based planning satisfies "structured auditable plan without external execution" without adding an LLM/dependency; document deferred tables (boss_approvals/permissions/memory/tool_calls/decisions) as later-phase. LESSON 3: permission checks belong in the service via typed tool contracts (requiredAutonomyLevel), persisted per-action (permissionResult), so audits prove the "AI → Tool → Permission Check → Validation → Service → DB" boundary.
REUSABLE: YES

DATE: 2026-09-25
CONTEXT: TENTH LOOP � Phase-01 Boss Core audit hardening (3 genuine gaps closed)
EXPECTED: Phase-01 BossCore was 'done' after loop 9
ACTUAL: Deep verification of boss.service.ts found 3 real audit/validation gaps, not manufactured work. (1) PATCH /boss/commands/:id (update) wrote NO audit entry for autonomy/status changes � audit-completeness breach for the phase whose deliverable is audit logs. (2) DELETE hard-deleted the command AND cascade-erased its whole audit trail (BossAuditLog.commandId ON DELETE CASCADE) � destructive in an auditable system. (3) No upper bound on command text length ? unbounded objective/audit payload. Fixed: update() writes an `updated` audit entry (detail includes changed fields); remove() soft-archives (status `archived`, audited, trail preserved; BossCommandStatus extended ['received','planned','archived']); create() rejects text >4000 chars (BOSS_COMMAND_TEXT_MAX_LENGTH, BadRequestException). 3 regression tests added. Tests 100/100 (10 suites); typecheck/lint/build PASS; prisma validate PASS; no schema/migration change. Committed 38c58d1 pushed, local==remote; production /health 200 database=ok + /boss/commands 401 after deploy. Phase-00 UNCHANGED: BLOCKED, 4 clicks, 0 conversions, revenue/profit ?0.
EVIDENCE QUALITY: FACT (executed gates; behavioral assertions on audit rows)
LESSON 1: In an audit-first phase, EVERY mutation of the audited entity must itself be audited � including updates and deletes � or the audit trail is a lie. LESSON 2: Never expose a hard-delete that cascade-erases history for a system whose deliverable IS the history; soft-archive preserves truth. LESSON 3: Re-verify a shipped feature WITH the adversarial checklist after the happy-path ship � the three regression tests were the actual deliverables of this loop.
REUSABLE: YES

DATE: 2026-09-25
CONTEXT: ELEVENTH LOOP (Owner MAXIMUM-AUTONOMY directive) � Phase-02 Opportunity Intelligence core built
EXPECTED: Owner directed continuing through every phase without pausing between them; Phase-01 was complete, Phase-02 is the evidence-backed opportunity intelligence phase
ACTUAL: Implemented the smallest safe slice that satisfies the Phase-02 gate ('repeatable evidence-backed ranked opportunities'): opportunity_evidence table (additive) + OpportunityIntelligenceModule. Evidence rows carry a claim, source, typed factor key, value (0..1) and an evidence QUALITY class (FACT/ESTIMATE/INFERENCE/PREDICTION/UNKNOWN). Scoring uses a versioned explicit weight set (SCORE_WEIGHTS_VERSION=1, Affiliate-03 canonical factors); QUALITY_WEIGHT makes UNKNOWN contribute zero so trend-chatter never ranks as profit. rank() returns opportunities ordered by total with components per factor, deterministic and tie-break by createdAt. Tests 106/106; typecheck/lint/build/prisma validate PASS. Nothing fabricated; no existing row mutated; Phase-00 unchanged (BLOCKED).
EVIDENCE QUALITY: FACT (executed gates; deterministic-scoring behavioral assertions)
LESSON 1: A phase gate can be met with a smallest-truthful core (evidence + deterministic scoring + ranking) while documented tables (opportunity_signals/opportunity_scores/trend_signals) and the financial-estimate layer (Affiliate-04) are legitimately deferred as phase follow-ons � do not fabricate trend data you cannot source. LESSON 2: Persisting the evidence QUALITY class per claim is the enforcement mechanism for 'evidence-backed' ranking: unknown-quality input is scored at weight zero. LESSON 3: Under maximum-autonomy, keep the same evidence standards � Phase-02 engineering proceeds but Phase-00 business gate stays BLOCKED until real Amazon conversion evidence exists.
REUSABLE: YES

DATE: 2026-09-25
CONTEXT: TWELFTH LOOP (Owner MAXIMUM-AUTONOMY directive) � Phase-03 revenue concentration KPI slice
EXPECTED: Continue through phases; Phase-03 is Money/Affiliate Engine
ACTUAL: Implemented the Phase-03 slice that is safe without a second provider: revenue concentration KPI (Affiliate-07). RevenueService.concentration() aggregates ONLY reconciled (verified) revenue events by provider, computes share %, and raises a riskAlert when one network exceeds 90% of verified revenue. Route GET /revenue-events/concentration (static path declared before ':id'). 3 new tests (single-provider 95.24% triggers alert; pending/rejected excluded; empty state). Tests 109/109; typecheck/lint/build/prisma validate PASS. NO schema/migration change. A second-provider adapter was deliberately NOT added � Affiliate-07 gates it behind the Money-First MVP gate. Phase-00 unchanged: BLOCKED.
EVIDENCE QUALITY: FACT (executed gates; concentration math assertions)
LESSON 1: When a phase gate forbids adding external integrations before evidence, find the slice that satisfies the KPI/deliverable with existing data (here: concentration of VERIFIED revenue) rather than stubbing a fake provider. LESSON 2: Money-integrity rule applies to derived KPIs too � concentration must exclude pending/rejected events or the measure overstates diversification. LESSON 3: Express route order matters � declare static routes ('concentration') before parameterized (':id') routes.
REUSABLE: YES

DATE: 2026-09-25
CONTEXT: THIRTEENTH LOOP (Owner MAXIMUM-AUTONOMY directive) � Phase-04 Content QA rules engine slice
EXPECTED: Continue through phases; Phase-04 is Content Factory
ACTUAL: Implemented the Phase-04 slice that is fully deterministic and read-only: a Content QA rules engine (content-qa.rules.ts) that evaluates BOTH mandated gates over a content asset � network-compliance (disclosure declared flag, disclosure sentence present in copy, destination must be https amazon.in/com, no misleading price/availability/urgency claims, no fake-review language) and content-quality (title 3..100, meaningful description on published assets, near-duplicate sibling detection). Endpoint GET /content-qa/assets/:id returns per-check PASS/FAIL + publishReady verdict. 7 tests incl a hidden-gap case: asset flagged disclosureAdded but copy has no disclosure sentence ? fails network gate despite the flag. Tests 116/116; typecheck/lint/build/prisma validate PASS. NO schema change; publish flow untouched (read-only enforcement). Phase-00 unchanged: BLOCKED.
EVIDENCE QUALITY: FACT (executed gates; rules-engine behavioral assertions)
LESSON 1: Compliance gates must verify CONTENT (sentence present), not just a boolean flag � the disclosureAdded flag alone is not evidence the disclosure exists (loop-8 lesson restated at QA level). LESSON 2: Build QA as a pure deterministic engine (no I/O) so verdicts are testable and repeatable, and keep the enforcement/wiring (QA-01 approval gate) separate from the rule evaluation. LESSON 3: Under max-autonomy keep publish-flow changes conservative � read-only QA now, enforcement once live assets + approval gate exist.
REUSABLE: YES

DATE: 2026-09-25
CONTEXT: FOURTEENTH LOOP (Owner MAXIMUM-AUTONOMY + OWNER-CHOSEN option 'QA-01 enforcement but safe') � Phase-04 QA-01 approval-gate enforcement
EXPECTED: Wire the QA verdict to gate publish WITHOUT breaking the live campaign
ACTUAL: Enforced QA-01 in ContentAssetService.update: a FRESH unpublished?published transition is rejected with 422 + full verdict unless the prospective (same-PATCH) state passes BOTH QA gates. Safe-by-construction: (1) only real transitions are gated � re-affirming published:true on a live asset is a no-op, never gated; (2) the prospective state is evaluated, so title/description changes in the same PATCH count; (3) PRE_APPROVED_PUBLISH_ASSET_IDS whitelists the live Campaign #3 asset (cmuczfp6y0002ah1g7fjqmuxd) so the gate can never block the running campaign. 5 new tests proving all three safety properties + the 422-with-verdict contract. Tests 121/121; typecheck/lint/build/prisma validate PASS; no migration. Phase-00 unchanged: BLOCKED.
EVIDENCE QUALITY: FACT (executed gates; behavioral assertions incl. state-unchanged-on-reject)
LESSON 1: When adding enforcement to a live system, scope it to the minimal event that needs control (the fresh transition) and add a pre-approval escape hatch for assets published before the rule existed � enforcement must never be able to injure already-running reality. LESSON 2: Evaluate the PROSPECTIVE state for a combined patch (title/desc + publish), not the stale stored row � otherwise a compliant publish could be misjudged by old data. LESSON 3: 422 UnprocessableEntityException with the full verdict payload gives an agent/Owner actionable reasons, not a bare error.
REUSABLE: YES

DATE: 2026-09-25
CONTEXT: FIFTEENTH LOOP (FINAL PROJECT COMPLETION SWEEP, Owner autonomous directive) � verify all authorized phases, execute all safe local work, deliver blocker matrix
EXPECTED: Do not stop at 'external API' mentions; sweep everything
ACTUAL: Verified Phases 01-04 implementations against their gates. Completed remaining category-A work: (1) QA-01 verification matrix closed with 2 isolated evidence tests (BOTH-gates-required � network-compliant asset with title>100 still 422; already-published reaffirmation proven NO-OP never gated using a non-pre-approved live asset); (2) Phase-03 revenue-concentration KPI surfaced as a dashboard widget (DashboardService.overview() embeds RevenueService.concentration(); web /dashboard shows per-provider share + risk alerts) � documented Phase-03 remaining item; (3) local dev DB migrated to full parity (5/5 apply cleanly). Full gate run: tests 124/124, typecheck/lint/build 9/9, prisma validate + migrate deploy PASS. Production smoke: /health 200 database=ok; 5 protected routes 401 fail-closed. Category A complete; Categories B/C/D scoped in a blocker matrix (Phase-04 content/pipeline, Phase-05 n8n, Phase-02 signal/estimation, Affiliate-07 second provider, Phase-00 business gate, Owner-level access). Phase-00 unchanged: BLOCKED.
EVIDENCE QUALITY: FACT (executed gates; isolated behavioral tests; production smoke)
LESSON 1: A completion sweep's discipline is: prove every demanded property with an isolated test rather than trusting aggregate green suites (both-gates + no-op reaffirmation were implied but not directly asserted � now they are). LESSON 2: 'Do not stop merely because scope mentions an external API' does not mean invent foundations � it means separate B/C/D precisely, complete the real A work (the documented dashboard widget, test gaps, DB parity), and give the Owner an exact capability-gap matrix instead of a hand-wave. LESSON 3: Blocker matrices must name the EXACT capability/evidence and whether a local foundation exists (boss tool registry, QA engine, RevenueModule, concentration KPI are the reusable foundations; empty tables/fingerprint stubs would be artificial).
REUSABLE: YES

DATE: 2026-09-25
CONTEXT: SWEEP RESTART (Owner: 'RESTART') - re-run the completion sweep with fresh eyes; do not stop while safe local work remains
EXPECTED: Re-apply the B/C/D discipline to the whole roadmap, not only Phases 01-04
ACTUAL: Freshly re-read git state (clean, HEAD 9bcf6e2) and schema. Discovered a category-A slice I had wrongly parked as 'later phase': PHASE-06 campaign analytics - per-campaign normalization of RECORDED affiliate evidence (links, clicks, conversions, reconciled revenue, net profit, provider count, channels) is deterministic, read-only, evidence-only, and directly serves money-watch (Owner can see Campaign #3 clicks/conversions/revenue/profit in one read). Built GET /campaign-analytics/overview: attribute via link.campaign; untagged links/events/profit fall into an explicit '(uncategorized)' bucket so totals ALWAYS reconcile (invariant: totals == raw aggregates); pending/rejected events NEVER count as conversions; no reach/impression inference (needs social API). Gates: api jest 127/127 (13 suites), typecheck 4/4, lint 3/3, build 9/9. Docs updated (03/05/06/10/11/MASTER). Phase-00 unchanged: BLOCKED.
EVIDENCE QUALITY: FACT (executed gates; isolated group/attribution tests; empty-db test)
LESSON 1: 'Later phase' must never be the default reason to stop - the screen for category-A is: can it be completed LOCALLY NOW, is it documented roadmap scope, and is it non-artificial? Campaign analytics passed all three (money-watch value, roadmap Phase-06, pure recorded-evidence math) - it was the sweep's missed A item. LESSON 2: For evidence-based analytics, design an invariant the tests can assert loudly (totals == raw aggregates, uncategorized bucket, pending/rejected exclusion) - that converts 'honest reporting' from a vibe into a checkable contract. LESSON 3: Attribution must resolve to a truth bucket, never a silently dropped row: orphan/untagged evidence goes to '(uncategorized)', not /dev/null.
REUSABLE: YES
DATE: 2026-09-25
CONTEXT: MAXIMUM-AUTONOMOUS loop-11 (Owner directive: execute all pending work A-F) — observability, provider registry, research boundary, fingerprints, Command Center, backups
EXPECTED: Sweep the full roadmap; only genuinely external/Owner-level blockers may remain
ACTUAL: Executed category-A batch across Phase-02/04/08/09. Phase-09 observability: global AllExceptionsFilter (uniform {statusCode,error,message,path,timestamp}; >=500 messages masked to `serverError` client-side, detail in server logs; 400/401/404/422 verbatim) + request-logger interceptor (APP_FILTER + APP_INTERCEPTOR wired). Provider adapter registry (providers/provider-adapter.ts + provider-registry.service.ts): 6 adapters (product-data/manual+pa-api, affiliate-network/amazon-associates+second-provider[GATED], automation/n8n, research-feed/trends); configured status = env var NAME PRESENCE only, never values; GET /system/providers + /:name behind global guard. Research boundary: validateResearchSignal (canonical factor/quality/value mapping, alias table, unknown quality -> 0). Content fingerprint: SHA-256 32-hex over normalized title+description+destination, fingerprint on QaEvaluation (never a gate failure). Phase-08 Command Center read foundation: boss.service.list() embeds plan->tasks->actions + audit trail; web /command-center SSR page (read-only, Bearer under API_KEY). Phase-09 backups: docs/09_BACKUP_RESTORE.md + scripts/db-backup.mjs + db-restore-test.mjs (npm run db:backup / db:restore-test; PGPASSWORD from DATABASE_URL + localhost->127.0.0.1) — LOCAL RESTORE DRILL PASS: source 13 tables -> scratch restore -> 13/13 tables, EVERY row count matches, scratch dropped, source untouched. .env.example documents credential NAMES only. Gates: api jest 157/157 (18 suites), typecheck/lint/build 12/12, prisma validate + migrate 5/5. LOCAL SMOKE: /health 200; /system/providers 401; /boss/commands 401. Phase-00 unchanged: BLOCKED, 4 clicks, 0 conversions, revenue/profit Rs0.
EVIDENCE QUALITY: FACT (executed gates; restore-drill table+row comparison; local smoke 401s)
LESSON 1: Provider registry that reports configured via env-var NAME PRESENCE is a credential-safe local foundation: capability is provable without any secret value ever being read or printed. LESSON 2: Error masking belongs at the FILTER boundary (uniform envelope, >=500 collapsed, client-safe), with full detail only server-side — never leak internal exception text to unauthenticated producers. LESSON 3: A restore runbook is only evidence-backed when actually EXECUTED (dump -> scratch restore -> compare 13/13 tables + every row count -> drop); script + theory is not a PASS. LESSON 4: pg tooling on Windows lives outside PATH here (D:\sql\bin) and localhost resolves to ::1 with no pg_hba entry — resolve to 127.0.0.1 + PGPASSWORD in the scripts, not the user.
REUSABLE: YES

CONTEXT: PREMIUM GLASSMORPHISM UI (Owner MAXIMUM-AUTONOMOUS directive) - Dashboard + Command Center + Home + NEW Campaign Analytics page
EXPECTED: Premium dark-glass AI CEO interface; only real data; never fabricate business metrics
ACTUAL: Shipped globals.css design system + _ui/ui.tsx server components + rewritten layout (sticky glass topbar nav) + Home/Dashboard/Command Center pages + new /campaigns page. All pages force-dynamic SSR, Bearer under server-side API_KEY only (never client). Conversion rate computed only when clicks>0 else 'Awaiting data'. Unknown -> 'Not available'/'Awaiting data'; API down -> 'API unavailable' banner; zero fabricated zeros; Phase-00 stays truthfully BLOCKED. Status colors always carry text labels (no color-only). Responsive, focus-visible, prefers-reduced-motion. ALSO fixed 2 pre-existing api lint warnings (unused ErrorBody, unused spec var) -> api lint 0 warnings. Gates: web typecheck/lint/build PASS; full turbo 12/12 (api jest 157/157, 18 suites); prisma validate + migrate 5/5. Local prod-mode smoke all 4 routes 200, leak=False. Frontend itself was NOT deployed until this session - added i-os-web to render.yaml (58e8a6f, additive, no architecture change) and it is LIVE; API_KEY on the web service is sync:false and NOT yet set by Owner (pages render honest fallback).
EVIDENCE QUALITY: FACT (gates green, build routes list /, /campaigns, /command-center, /dashboard, local smoke 200s + leak scan)
LESSON 1: A server-component glass UI can carry the full premium look with ZERO client JS and NO secrets on the page: keep API_KEY at module scope, pass nothing to client components, and let SSR fetch with Bearer. LESSON 2: Honest empty states ('No conversions yet', 'Awaiting Amazon Associates evidence', 'Awaiting data') read as premium, not broken - fabricating zeros for unknown values is the real failure. LESSON 3: A sync:false secret on Render means the page must be built to degrade gracefully until the Owner pastes the value; never embed or log it.
REUSABLE: YES

CONTEXT: LIVE-DATA E2E after Owner set API_KEY on ai-os-web
EXPECTED: Deployed glass UI shows real production data end-to-end
ACTUAL: Verified 2026-09-26 - all 4 routes 200, leak=False, no fallback banners. Dashboard renders Campaign #3 live (4 clicks, 0 conversions, Rs0.00/0, Active campaigns=1, providers 2/6). Command Center Commands=0 -> truthful 'No owner commands yet' empty state. Campaigns page: 1 campaign dhruvs-nazariya-anklet-c3, clicks 4, conversions 0, 0.00% close, Rs0 revenue/profit. api /health 200 database=ok. Phase-00 TRUTHFULLY BLOCKED at 4 clicks/0 conversions.
EVIDENCE QUALITY: FACT (rendered HTML extraction + /health probe)
LESSON: A premium UI is complete when the honest empty states ('No owner commands yet', 'No revenue recorded', 'Awaiting data') render from a live authenticated feed - not when numbers are invented to fill them.
REUSABLE: YES

CONTEXT: AUTONOMOUS AUDIT-FIX pass (postcss advisories, hygiene, README)
EXPECTED: Close every safe local gap; keep production green; no breaking upgrades
ACTUAL: postcss 8.4.31 (next-pinned) carries 4 high CVEs (CSS stringify XSS + source-map file read) - closed via root overrides->8.5.28 (same 8.x) + devDep; verified by full turbo 12/12 + npm ci --dry-run + identical web build. deepmerge-ts 7.1.5 (3 high, via prisma @prisma/config) left as documented residual: prisma's range excludes 8.0 (the fix) -> needs prisma 7/8 major = breaking, out of scope; no practical attack (static repo config). Added .gitignore entries (.kilo/, db/backups/) - db/backups holds pg dumps with MONEY records, must never reach git. Added root README.md. Prod re-verified (health 200, 401 fail-closed x4, /nope 404, click-nope 404 public). Phase-00 unchanged BLOCKED (4/0/Rs0/Rs0).
EVIDENCE QUALITY: FACT (gates, npm ci --dry-run, prod probes)
LESSON 1: npm overrides on an EXISTING lockfile can silently not apply - removing the stale package folder + installing a direct (dev)dep with the same version will force the lock entry to converge; always re-run npm ci --dry-run (Render uses npm ci) and the full gate set before committing. LESSON 2: classify audit flags before chasing them - build-time tooling vulnerabilities on trusted inputs are not the same class as runtime exposure; a MAJOR bump (next 16 / prisma 7-8) to silence an advisory is a WORSE change than the advisory.
REUSABLE: YES
