# MASTER_PROJECT_STATE.md

**The system should always be able to answer these from this file + 03_DEVELOPMENT_STATUS.md:**

| Field | Value |
|---|---|
| Current Phase | PHASE-00 (7 of 8 task items done; PRODUCTION technical gate PASSED 2026-09-14; business gate blocked on real conversion + verified commission) |
| Current Build Status | Turborepo monorepo green: api 42 jest tests PASS, web builds + dashboard SSR verified, DB migrated (3 migrations). PRODUCTION api live on Render+Neon (https://ai-os-api-1eck.onrender.com) — /health 200, full affiliate/click/dashboard loop verified |
| Current Opportunities | List ready (table + CRUD); 0 rows in DB (research-only; no production rows created for #2). Campaign #2 research DONE 2026-09-15: 6 candidates scored live, TOP 5 presented, awaiting Owner product approval (see 10_CHANGE_HISTORY) |
| Active Campaigns | #1 GIVA 925 silver zircon hoop earrings (B09DGJR1Z7) — link + content asset DRAFTED, disclosure added, NOT yet published (awaiting Owner approval). #2 — research/approval stage, no production link/asset |
| Content Channel | Pinterest — manual publishing wired (TASK 6); no API |
| Pending Approvals | 1) Publish Campaign #1 pin externally (second Owner approval). 2) Approve Campaign #2 product (research recommends GIVA Toe Rings B09DGKCSH8, runner-up GIVA Zircon Constellation Earrings B0BBW66SSM — Commission % UNVERIFIED for all) |
| Current Revenue | ₹0 |
| Current Profit | ₹0 |
| Best Opportunity | Research-stage (no DB row): GIVA Toe Rings B09DGKCSH8 — ₹934 (−58%, MRP ₹2,199), 4.3★ (141 ratings), 200+ bought/past month, IN STOCK, #5 in Women's Rings / #87 in Jewellery, BIS 925 cert, 6-mo warranty, October Prime + wedding/anniversary/birthday season. Commission % UNVERIFIED |
| Worst Opportunity | Research-stage: ZAVYA CZ Bali Hoops B0BCC43YQ8 — 3.6★ (42 ratings), only 1 left in stock, #15,778 in Jewellery |
| Recent Failures | None yet (2 transient build failures fixed during scaffold; web typecheck race with .next/types when forcing caches) |
| Recent Wins | Pinterest publishing wiring + disclosure gate; dashboard showing clicks/conversions/profit live; channel recorded config-level; **PRODUCTION deploy live on Render + Neon — API public, /health 200, full click-tracking loop verified (302 → tagged destination → PINTEREST click recorded → dashboard attribution); smoke rows cleaned**; **Campaign #1 drafted end-to-end on production (link + disclosure-added content asset) awaiting publish approval** |
| AI Provider Status | Not configured — Ollama not running; see 08_INTEGRATIONS.md |
| System Health | prod API https://ai-os-api-1eck.onrender.com — /health HTTP 200 (`{"status":"ok","service":"@ai-os/api","database":"not-checked"}`); Neon reachable (link create + click writes succeeded 2026-09-14); local api health ok; PostgreSQL `aios` healthy; web serves on :3000; dashboard at /dashboard |
| Next Recommended Action | Owner decision on TWO approvals: (A) APPROVE PUBLICATION of Campaign #1 pin (PATCH link cmu1m77qy0000ba1yzz4thfnu asset cmu1m9upy0002ba1ya9j1lmls → published true after external pin), and (B) select Campaign #2 product from TOP 5 (recommended B09DGKCSH8) so research moves to production link + asset creation. No PUBLISH / link / asset created for #2 yet |

**Update this table every session — it's the fastest orientation point for both the agent and the Owner.**
