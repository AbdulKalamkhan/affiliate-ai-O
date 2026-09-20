# MASTER_PROJECT_STATE.md

**The system should always be able to answer these from this file + 03_DEVELOPMENT_STATUS.md:**

| Field | Value |
|---|---|
| Current Phase | PHASE-00 (7 of 8 task items done; PRODUCTION technical gate PASSED 2026-09-14; business gate blocked on real conversion + verified commission). PHASE-01 security hardening IMPLEMENTED locally 2026-09-20 (pushed; requires API_KEY secret on Render before deploy) |
| Current Build Status | Turborepo monorepo green: api 56 jest tests PASS (incl security guard specs), web builds + dashboard SSR verified, DB migrated (3 migrations). PRODUCTION api live on Render+Neon (https://ai-os-api-1eck.onrender.com) — /health 200, full affiliate/click/dashboard loop verified. NOTE: hardened build NOT yet deployed; Render must get API_KEY secret first |
| Current Opportunities | List ready (table + CRUD); 0 rows in DB (no opportunity rows created). Campaign #2 research DONE 2026-09-15 (6 candidates scored, TOP 5; see 10_CHANGE_HISTORY), product APPROVED by Owner 2026-09-16 |
| Active Campaigns | #1 GIVA hoop earrings (B09DGJR1Z7) — link cmu1m77qy0000ba1yzz4thfnu + asset cmu1m9upy0002ba1ya9j1lmls DRAFTED, disclosure added, NOT published (awaiting APPROVE PUBLICATION). #2 GIVA Toe Rings (B09DGKCSH8) — link cmu4htr2r0000cn1gjsuz3kvf + asset cmu4hufm60002cn1gk61ditoz DRAFTED, disclosure added + real disclosure sentence present (fixed 2026-09-20), NOT published |
| Content Channel | Pinterest — manual publishing wired (TASK 6); no API |
| Pending Approvals | 1) Publish Campaign #1 pin externally (APPROVE PUBLICATION awaited). 2) Publish Campaign #2 pin externally (APPROVE PUBLICATION awaited — NOT YET SENT). Commission % UNVERIFIED for both |
| Current Revenue | ₹0 |
| Current Profit | ₹0 |
| Best Opportunity | GIVA Toe Rings B09DGKCSH8 (Campaign #2, DRAFTED) — ₹934 (−58%, MRP ₹2,199) VERIFIED 2026-09-16, 4.3★ (141 ratings), 200+ bought/past month, IN STOCK, #5 Women's Rings / #87 Jewellery, BIS 925 cert, 6-mo warranty, VRP Telematics / Amazon Fulfilled. Commission % UNVERIFIED |
| Worst Opportunity | Research-stage: ZAVYA CZ Bali Hoops B0BCC43YQ8 — 3.6★ (42 ratings), only 1 left in stock, #15,778 in Jewellery |
| Recent Failures | None yet (2 transient build failures fixed during scaffold; web typecheck race with .next/types when forcing caches) |
| Recent Wins | Pinterest publishing wiring + disclosure gate; dashboard showing clicks/conversions/profit live; channel recorded config-level; **PRODUCTION deploy live on Render + Neon — API public, /health 200, full click-tracking loop verified (302 → tagged destination → PINTEREST click recorded → dashboard attribution); smoke rows cleaned**; **Campaign #1 drafted end-to-end on production (link + disclosure-added content asset) awaiting publish approval** |
| AI Provider Status | Not configured — Ollama not running; see 08_INTEGRATIONS.md |
| System Health | prod API https://ai-os-api-1eck.onrender.com — /health HTTP 200 (`{"status":"ok","service":"@ai-os/api","database":"not-checked"}`); Neon reachable (link create + click writes succeeded 2026-09-14); local api health ok; PostgreSQL `aios` healthy; web serves on :3000; dashboard at /dashboard. Local hardened API /health now does a real DB probe (database=ok/degraded) |
| Next Recommended Action | Owner action REQUIRED: (1) set `API_KEY` secret in Render dashboard, then deploy the hardened PHASE-01 build (without it the API 401s everywhere except /health + click redirect); (2) paste the two real `https://www.pinterest.com/pin/...` URLs (Campaign #1 + #2) so the 10-point pin verification can run and `published=true` may be set. Both campaigns currently PRODUCT APPROVED / DRAFT CREATED / PUBLICATION BLOCKED |

**Update this table every session — it's the fastest orientation point for both the agent and the Owner.**
