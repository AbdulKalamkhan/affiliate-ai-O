# 05_TASK_QUEUE.md

**Update this file every session — mark tasks done, add new ones.**

## Up next (Phase 00 — do these in order)
1. [x] ARCH-01 — Repository First-Boot Audit (2026-09-13) — docs-only bootstrap, no code exists; baseline recorded in 03_DEVELOPMENT_STATUS.md
2. [x] Set up Turborepo monorepo skeleton (apps/web, apps/api minimal) (2026-09-13)
3. [x] Set up PostgreSQL + Prisma, minimal schema: `affiliate_links`, `affiliate_link_clicks`, `revenue_events`, `profit_records` (2026-09-13, migration `20260913132220_init`)
4. [ ] Simple opportunity list (manual entry is fine for MVP)
5. [ ] Affiliate link generator + click tracking endpoint
6. [ ] Manual publish to ONE content channel (pick one — do not do all three)
7. [ ] Minimal dashboard page showing clicks/conversions/profit
8. [ ] VERIFY-01 — Universal Completion Prompt before marking Phase 00 done

## Backlog (do not start before Phase 00 gate passes)
- PHASE-01 through PHASE-12 task prompts — see AI_OS_Agent_Documentation.md Section 12
- Seller-01 through Seller-10 (Seller Engine) — later phase
- SOC-01 through SOC-05 (Social Media) — later phase
- N8N-01 through N8N-06 (Automation) — Phase 05+

## Completed
- 2026-09-13: ARCH-01 Repository First-Boot Audit
- 2026-09-13: Phase-00 monorepo skeleton (Turborepo + npm workspaces; apps/api NestJS, apps/web Next.js)
- 2026-09-13: PostgreSQL + Prisma schema + init migration (5 tables in db `aios`)
