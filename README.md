# AI_OS — Affiliate AI CEO & Money Operating System

Money-First MVP: record real affiliate link clicks, conversions, revenue and profit — nothing is ever fabricated.

## What it is

- **API** (NestJS, `apps/api`): click-tracking redirect, affiliate links, content assets, revenue/profit records (reconcile path), dashboard overview, per-campaign analytics, owner Command Center (Boss), opportunity intelligence, content QA gates, provider registry, health.
- **Web** (`apps/web`, Next.js SSR): premium glassmorphism dashboards — Home, `/dashboard`, `/command-center`, `/campaigns`. Server components only; the API key never reaches the browser.
- **Database**: PostgreSQL + Prisma (`packages/database`), additive migrations only.

## Production

| Service | URL |
|---|---|
| API | https://ai-os-api-1eck.onrender.com |
| Web | https://ai-os-web.onrender.com |

Routes: `/`, `/dashboard`, `/command-center`, `/campaigns` — all live (200).

## Architecture

```
Browser → Next.js server (API_BASE_URL + server-side API_KEY) → NestJS API → PostgreSQL
```

- Fail-closed authentication: every route except `/health` and the public click redirect requires `Authorization: Bearer <API_KEY>`.
- `API_KEY`, `DATABASE_URL` are server-side secrets (`sync:false` Render secrets). Never in client code, HTML, JS, URLs, git, or logs.
- Open-redirect guard: the public redirect only ever targets https Amazon domains; stored destinations are built server-side.
- Error masking: all 5xx are masked client-side (`serverError`); detail is logged server-side only.
- Rate limiting + structured observability (request log interceptor, global exception filter).

## Current business state (Phase-00)

Truthful as of last verified production read-back:

- Campaign #3 `dhruvs-nazariya-anklet-c3` (ASIN `B08BG1HC7R`, tag `zorajewellery-21`): **4 clicks, 0 conversions, ₹0 revenue, ₹0 profit**.
- Business gate remains **BLOCKED_EXTERNAL** until genuine Amazon Associates conversion/commission evidence exists. Nothing is fabricated; no fake zeros, no invented metrics.

On verified evidence arrive: `POST /revenue-events` (pending, idempotent on `[provider, sourceId]`) → `POST /revenue-events/:id/reconcile` → ProfitRecord (`netProfit = gross − fee − cost`) → dashboard + analytics update automatically.

## Local development

Requirements: Node ≥20, PostgreSQL reachable as the `aios` role (see `.env.example`, never commit `.env`).

```bash
npm install
npm run db:generate
npm run db:migrate      # applies migrations to local DB
npm run dev             # API on :3001 + web on :3000
```

## Verification commands

```bash
npm test                # api jest (or: npx turbo run test)
npm run typecheck
npm run lint
npm run build
npx prisma validate --schema packages/database/prisma/schema.prisma
npx prisma migrate status --schema packages/database/prisma/schema.prisma
npm run db:backup       # timestamped custom-format dump → db/backups/
npm run db:restore-test # local restore drill (scratch DB, source untouched)
```

## Deployment

`render.yaml` defines both services (`ai-os-api`, `ai-os-web`). Render redeploys on every push to `main`:

- API start: `prisma migrate deploy` then `node apps/api/dist/main.js`.
- Web start: Next SSR with `API_BASE_URL` pointing at the API and `API_KEY` (server-side secret).

Post-deploy smoke: `/health` 200; protected routes without a key 401; unknown routes 404; click redirect on missing id 404.

## Documentation

- `AI_CONTEXT/MASTER_PROJECT_STATE.md` — fastest orientation (current phase, build, money state, blockers, owner actions).
- `AI_OS_Agent_Documentation.md` — full roadmap + phase gates.
- `AI_CONTEXT/05_TASK_QUEUE.md` — task/blocker matrix.
- `AI_CONTEXT/10_CHANGE_HISTORY.md` — append-only per-session change log.