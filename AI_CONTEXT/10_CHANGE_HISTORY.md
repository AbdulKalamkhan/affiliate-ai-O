# 10_CHANGE_HISTORY.md

**Append-only. One entry per meaningful change. Use Conventional Commits style prefixes to match git log.**

## Format
```
DATE | phase | commit-type: short description | evidence (tests run, PASS/FAIL)
```

## Log
2026-09-13 | 00 | docs: run ARCH-01 Repository First-Boot Audit — no code changes | evidence: repo inspection (no .git, no manifests), doc hash check (root vs package identical), node 24/npm 11/git 2.55 present, PostgreSQL service running on 5432, Ollama/n8n/Redis not running, secrets scan clean, PASS

2026-09-13 | 00 | chore: bootstrap Phase-00 monorepo (Turborepo + npm workspaces; apps/api NestJS 11, apps/web Next 15, tsconfig.base) | evidence: turbo typecheck/lint/test/build 12/12 PASS; api /health 200 {"status":"ok"}; web / serves "AI_OS — Phase 00 MVP"; PASS

2026-09-13 | 00 | chore(db): provision local PostgreSQL role/db `aios` (least privilege, no superuser) | evidence: psql connect as aios@aios reports pg 18.4; PASS

2026-09-13 | 00 | feat(db): add Phase-00 Prisma schema + init migration (affiliate_links, affiliate_link_clicks, revenue_events, profit_records) | evidence: prisma migrate dev applied 20260913132220_init; psql \dt shows 5 tables (incl _prisma_migrations); PASS

2026-09-13 | 00 | feat(db): add opportunities table + manual product fields on affiliate_links | evidence: migration 20260913135814_add_opportunities_and_product_fields applied; PASS

2026-09-13 | 00 | feat(task4): opportunities CRUD module (create/list/get/patch/delete + status validation) | evidence: jest PASS; live HTTP create/list/patch/delete OK, invalid status 400, missing 404; PASS

2026-09-13 | 00 | feat(task5): affiliate link generator + click-tracking redirect (manual tag, no PA-API; ProductDataProvider boundary left ready for PA-API) | evidence: jest 31 tests PASS (4 suites); live: tagged destination `...&tag=zorajewellery-21`, ASIN extracted, 302 + Location headers, _count.clicks=1, 404s, delete cascades; test rows cleaned (DB 0 rows); PASS
