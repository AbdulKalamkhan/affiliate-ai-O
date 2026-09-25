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
