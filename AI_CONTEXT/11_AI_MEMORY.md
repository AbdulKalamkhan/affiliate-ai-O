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
