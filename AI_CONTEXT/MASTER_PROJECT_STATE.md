# MASTER_PROJECT_STATE.md

**The system should always be able to answer these from this file + 03_DEVELOPMENT_STATUS.md:**

| Field | Value |
|---|---|
| Current Phase | PHASE-00 (7 of 8 task items done; PRODUCTION technical gate PASSED 2026-09-14; business gate blocked on real conversion + verified commission) |
| Current Build Status | Turborepo monorepo green: api 42 jest tests PASS, web builds + dashboard SSR verified, DB migrated (3 migrations). PRODUCTION api live on Render+Neon (https://ai-os-api-1eck.onrender.com) — /health 200, full affiliate/click/dashboard loop verified |
| Current Opportunities | List ready (table + CRUD); 0 rows (smoke rows cleaned) |
| Active Campaigns | #1 GIVA 925 silver zircon hoop earrings (B09DGJR1Z7) — link + content asset DRAFTED, disclosure added, NOT yet published (awaiting Owner approval) |
| Content Channel | Pinterest — manual publishing wired (TASK 6); no API |
| Pending Approvals | Publish Campaign #1 pin externally (second Owner approval) |
| Current Revenue | ₹0 |
| Current Profit | ₹0 |
| Best Opportunity | N/A |
| Worst Opportunity | N/A |
| Recent Failures | None yet (2 transient build failures fixed during scaffold; web typecheck race with .next/types when forcing caches) |
| Recent Wins | Pinterest publishing wiring + disclosure gate; dashboard showing clicks/conversions/profit live; channel recorded config-level; **PRODUCTION deploy live on Render + Neon — API public, /health 200, full click-tracking loop verified (302 → tagged destination → PINTEREST click recorded → dashboard attribution); smoke rows cleaned**; **Campaign #1 drafted end-to-end on production (link + disclosure-added content asset) awaiting publish approval** |
| AI Provider Status | Not configured — Ollama not running; see 08_INTEGRATIONS.md |
| System Health | prod API https://ai-os-api-1eck.onrender.com — /health HTTP 200 (`{"status":"ok","service":"@ai-os/api","database":"not-checked"}`); Neon reachable (link create + click writes succeeded 2026-09-14); local api health ok; PostgreSQL `aios` healthy; web serves on :3000; dashboard at /dashboard |
| Next Recommended Action | Owner approves and externally publishes Campaign #1 pin in Pinterest (destination https://ai-os-api-1eck.onrender.com/affiliate-links/cmu1m77qy0000ba1yzz4thfnu → amazon.in B09DGJR1Z7?tag=zorajewellery-21); after publish, PATCH content asset published=true; wait for real click → conversion → commission, then run VERIFY-01 |

**Update this table every session — it's the fastest orientation point for both the agent and the Owner.**
