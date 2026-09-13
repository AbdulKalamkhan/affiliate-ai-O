# 08_INTEGRATIONS.md

## Coding agent access (decide and record this FIRST, before Phase 00 starts)
- Chosen agent: OpenCode (opencode / big-pickle) — in use this session
- Access confirmed working (trivial task tested): YES (2026-09-13 — file reads, hash checks, tooling/port checks executed successfully)
- Local model in use (if applicable): NONE — Ollama not running (localhost:11434 closed)
- Fallback plan if local model insufficient: (none configured yet — optional Gemini/other adapters per 02_ARCHITECTURE.md; AI layer not required for Phase 00 core loop)

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
| Provider | Status | Notes |
|---|---|---|
| Ollama (local) | (not set up) | Primary — pick model per hardware (see 02_ARCHITECTURE.md) |
| Gemini (optional) | (not connected) | Optional research/reasoning adapter, never mandatory |

## Local infrastructure
| Component | Status | Notes |
|---|---|---|
| PostgreSQL 18.4 | Connected | localhost:5432, db `aios`, user `aios` (least privilege); DATABASE_URL in gitignored .env; client bin at D:\sql\bin |
| Redis | (not running) | Only needed for BullMQ queues later |
| n8n | (not running) | Phase 05+; see 02_ARCHITECTURE.md |
| Ollama | (not set up) | Port 11434 closed; see AI providers above |

## Rule
Never store actual secrets/keys in this file or any AI_CONTEXT file — record connection *status* only. Actual credentials go in `.env` (never committed) or a secrets manager.
