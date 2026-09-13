# 09_DECISIONS.md

**Append-only log. Never delete an old decision — mark it superseded instead.**

## Format
```
DATE: [date]
DECISION: [what was decided]
REASON: [why]
ALTERNATIVES CONSIDERED: [if any]
STATUS: ACTIVE / SUPERSEDED (if superseded, link to the new decision)
```

## Log

DATE: (project start)
DECISION: Use AI_OS Consolidated Master Specification v5 + AI_OS_Agent_Documentation.md as canonical source of truth, superseding all earlier draft specs.
REASON: Earlier drafts had overlapping/conflicting phase numbering that would confuse a coding agent.
STATUS: ACTIVE

DATE: (project start)
DECISION: Start at PHASE-00 (Money-First MVP), not PHASE-01, regardless of how complete the full architecture documentation looks.
REASON: Avoid building months of infrastructure before proving the underlying business model converts.
STATUS: ACTIVE

DATE: (project start)
DECISION: Monorepo tool = Turborepo. Auth = NextAuth.js. Analytics dashboard (Phase 08+) = Metabase, not custom-built.
REASON: Avoid undecided/ad-hoc tooling choices that cost time later.
STATUS: ACTIVE

DATE: 2026-09-13
DECISION: Relocate AI_OS_Package delivery contents into the monorepo root (AI_CONTEXT/ now at D:\Affiliate-AI-OS\AI_CONTEXT per 02_ARCHITECTURE.md). AI_OS_Package folder removed; original AI_OS_Package.zip kept.
REASON: Deployment root is D:\Affiliate-AI-OS; the subfolder was only delivery packaging.
ALTERNATIVES CONSIDERED: Using AI_OS_Package as the repo root.
STATUS: ACTIVE

DATE: 2026-09-13
DECISION: Provision a dedicated least-privilege PostgreSQL role + database: user `aios` (LOGIN + CREATEDB, NO SUPERUSER), database `aios`, on the existing local PostgreSQL 18.4 (D:\sql). Credentials exist only in gitignored root .env.
REASON: No password was available for the `postgres` superuser; local pg_hba.conf trusts loopback connections for non-postgres roles. Never invent or guess credentials — the superuser password is recorded as a known UNKNOWN.
STATUS: ACTIVE

DATE: 2026-09-13
DECISION: Package manager = npm workspaces; Prisma 6.19.3 with prisma-client-js generator; Prisma client generated into package-local node_modules per default.
REASON: pnpm/yarn are not installed on this machine; npm workspaces + Turbo satisfy the monorepo requirement with least tooling.
STATUS: ACTIVE
