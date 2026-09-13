# 07_PROTECTED_FILES.md

**Agent must not rewrite or delete these without explicit evidence of a security/correctness problem.**

## Protected by default (once they exist)
- Any working, tested business logic
- Existing database migrations (never edit a past migration — always create a new one)
- Authentication/session configuration
- Payment/financial calculation logic
- Affiliate tracking / click-attribution logic
- Any file under `AI_CONTEXT/` — edit additively, don't wholesale overwrite without reading first
- `.env` files and anything containing secrets/credentials

## Currently protected (update as the repo grows)
- `packages/database/prisma/migrations/20260913132220_init/` — database migration, never edit; new migrations only
- `packages/database/prisma/schema.prisma` — schema is additive-only; edits must be phased with migration
- `apps/api/src/health/health.controller.ts` + `.spec.ts` — working tested logic (jest PASS)
- Root `.env` — contains DATABASE_URL secret; never commit, never echo contents
- `apps/api/src/main.ts`, `apps/web/app/*` — working skeleton builds (PASS); change additively
