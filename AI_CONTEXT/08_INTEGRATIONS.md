# 08_INTEGRATIONS.md

## Coding agent access (decide and record this FIRST, before Phase 00 starts)
- Chosen agent: OpenCode (opencode / big-pickle) — in use this session
- Access confirmed working (trivial task tested): YES (2026-09-13 — file reads, hash checks, tooling/port checks executed successfully)
- Local model in use (if applicable): NONE — Ollama not running (localhost:11434 closed)
- Fallback plan if local model insufficient: (none configured yet — optional Gemini/other adapters per 02_ARCHITECTURE.md; AI layer not required for Phase 00 core loop)

## Content channels (publishing)
| Channel | Status | Notes |
|---|---|---|
| Pinterest | ACTIVE — manual publishing only | Owner choice (2026-09-13). Pins are created manually by Owner; wiring in TASK 6 records pin title/description/destination (tagged link), published/publishedAt, and enforces the Amazon disclosure gate. NO Pinterest API — SOC-04 automation is a later phase (TASK 6 scope out). Source recorded as `Channel.PINTEREST` on the tracked link + dashboard "clicks by channel". |
| YouTube | (not connected) | Later phase |
| Instagram | (not connected) | Later phase |

## Affiliate networks
| Network | Status | Notes |
|---|---|---|
| Amazon Associates | CONNECTED (SiteStripe / manual tag) | Store ID: zorajewellery-21. Tag appended manually to enterable Amazon product URLs — NO PA-API. PA-API BLOCKED: requires 10 qualifying sales in the trailing 30 days (0 today). Product-data provider = `manual` behind the Affiliate-01 interface (ProductDataProvider); a PA-API adapter is a future DI/provider change only. |
| Flipkart Affiliate | (not connected) | Backup network — add after Phase 00 gate passes |
| Others | (not connected) | |

## Seller marketplace accounts
| Marketplace | Status | Notes |
|---|---|---|
| Amazon Seller Central | (not connected) | |
| Flipkart Seller Hub | (not connected) | |
| Meesho Supplier Panel | (not connected) | |

## Social accounts
| Platform | Status | Notes |
|---|---|---|
| YouTube | (not connected) | Daily upload quota applies (free tier) |
| Instagram | (not connected) | Needs Business/Creator account + linked FB Page; Meta App Review beyond small scale |
| Pinterest | (not connected) | Needs Business account |

## AI providers
The provider-neutral AI boundary is IMPLEMENTED + TESTED (`apps/api/src/ai`, commit 5f83f0d). It is the only sanctioned path to a language model; an AI response can suggest but never mutate business state. Fail-closed honesty: no credential => `not_configured` => every call fails with `NOT_CONFIGURED` (no fabricated completion, no stub fallback); `verified` comes only from a successful REAL call. Adapters: `openai_compatible`, `local` (distinct names), `mock` (off unless `AI_ENABLE_MOCK_PROVIDER`); `anthropic`/`google` declared with no adapter.

| Provider | Status | Notes |
|---|---|---|
| openai_compatible (hosted) | (not configured) | Credential absent (`AI_DEFAULT_PROVIDER` + `OPENAI_API_KEY`). Reports `not_configured`. |
| local (self-hosted OpenAI-compatible) | (not configured) | Distinct provider name so it is never reported as the hosted vendor; model ids only from `AI_LOCAL_MODELS`. |
| Ollama (local) | (not set up) | Port 11434 closed (2026-09-13). |
| anthropic / google | (no adapter) | Declared provider names only — naming one fails with `UNKNOWN_MODEL` rather than pretending. |

## Local infrastructure
| Component | Status | Notes |
|---|---|---|
| PostgreSQL 18.4 | Connected | localhost:5432, db `aios`, user `aios` (least privilege); DATABASE_URL in gitignored .env; client bin at D:\sql\bin |
| Redis | (not running) | Only needed for BullMQ queues later |
| n8n | (not running) | Phase 05+; see 02_ARCHITECTURE.md |
| Ollama | (not set up) | Port 11434 closed; see AI providers above |

## Production hosting (Phase-00 public click-tracker)
| Component | Status | Notes |
|---|---|---|
| Render web service `ai-os-api` (free, `runtime: node`) | LIVE | Public URL `https://ai-os-api-1eck.onrender.com` (verified 2026-09-14; /health HTTP 200). Blueprint `render.yaml` (build: prisma generate + turbo build filter api; start: prisma migrate deploy + node apps/api/dist/main.js). `NODE_VERSION=24`, `ASSOCIATE_TAG=zorajewellery-21` set. |
| Neon PostgreSQL (production DB) | LIVE | `DATABASE_URL` set as Render secret (`sync:false`), value NEVER stored in repo/memory/chat. Prisma migrations auto-run on boot via `prisma migrate deploy`. Connectivity proven by production writes (link create 201, click row create 200) — no `_prisma_migrations` failure observed. |
| Render web service `ai-os-web` (Next.js SSR) | LIVE | Public URL `https://ai-os-web.onrender.com` (deployed 2026-09-26). Read-only dashboards render server-side; the API key stays server-side and is NEVER sent to the browser. `API_BASE_URL=https://ai-os-api-1eck.onrender.com`; `API_KEY` set as a Render secret (`sync:false`) by Owner. Pages: `/`, `/dashboard`, `/command-center`, `/campaigns`, `/seller`. 7 security headers live; x-powered-by off. |
| Migration status | 14 applied (2026-10-09) | Init `20260913132220_init`; `20260913135814_add_opportunities_and_product_fields`; `20260913142055_add_content_assets_and_channel`; `20260925123000_add_boss_core`; `20260925130000_add_opportunity_evidence`; `20260926101432_add_boss_execution_and_seller_foundation`; `20260926101500_add_audit_actor_and_execution_indexes`; `20260926110000_add_publish_approvals`; `20260926110012_seller_settlement_unknown_safe`; `20260927074618_automation_job_queue`; `20260927083914_automation_job_replay_count`; `20260927092952_ai_provider_boundary`; `20260927125000_add_seller_settlement_lines`; `20260928201500_approval_scoping_and_action_version`. Production startup runs `migrate deploy` (idempotent); local `prisma migrate status` = up to date. |
| Free-tier limits | Risk | Spins down after 15 min idle (~1 min cold start); 750 instance-hrs/mo. Fine for Phase-00 gate. |

## Rule
Never store actual secrets/keys in this file or any AI_CONTEXT file — record connection *status* only. Actual credentials go in `.env` (never committed) or a secrets manager.
