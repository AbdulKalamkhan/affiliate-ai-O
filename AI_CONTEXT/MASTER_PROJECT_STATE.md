# MASTER_PROJECT_STATE.md

**The system should always be able to answer these from this file + 03_DEVELOPMENT_STATUS.md:**

| Field | Value |
|---|---|
| Current Phase | PHASE-00 (in progress — 7 of 8 task items done; gate blocked on real conversion) |
| Current Build Status | Turborepo monorepo green: api 42 jest tests PASS, web builds + dashboard SSR verified, DB migrated (3 migrations) |
| Current Opportunities | List ready (table + CRUD); 0 rows (smoke rows cleaned) |
| Active Campaigns | None yet |
| Content Channel | Pinterest — manual publishing wired (TASK 6); no API |
| Pending Approvals | None yet |
| Current Revenue | ₹0 |
| Current Profit | ₹0 |
| Best Opportunity | N/A |
| Worst Opportunity | N/A |
| Recent Failures | None yet (2 transient build failures fixed during scaffold; web typecheck race with .next/types when forcing caches) |
| Recent Wins | Pinterest publishing wiring + disclosure gate; dashboard showing clicks/conversions/profit live; channel recorded config-level |
| AI Provider Status | Not configured — Ollama not running; see 08_INTEGRATIONS.md |
| System Health | api health ok; PostgreSQL `aios` healthy; web serves on :3000; dashboard at /dashboard |
| Next Recommended Action | TASK 8 / Phase-00 gate: Owner publishes a first REAL Pinterest pin (from the wired content-assets flow) so a real click → conversion → commission can be tracked, then run VERIFY-01 |

**Update this table every session — it's the fastest orientation point for both the agent and the Owner.**
