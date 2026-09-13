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

DATE: 2026-09-13
DECISION: Content channel = Pinterest (Phase-00), manual publishing ONLY — no Pinterest API (SOC-04 is a later phase). Channel modeled as a config enum (`Channel.PINTEREST` on `affiliate_links`, mirrored by `CONTENT_CHANNELS` in the API) — core logic never branches on channel names.
REASON: Provider/channel-neutral + additive-architecture rule; Phase-00 proves the loop manually before automating.
ALTERNATIVES CONSIDERED: YouTube, Instagram (rejected for Phase-00 — Owner picked Pinterest).
STATUS: ACTIVE

DATE: 2026-09-13
DECISION: Content publishing has a compliance gate: `content_assets.disclosureAdded` must be true before `published` can be true; disclosure cannot be removed while published; `publishedAt` is the manual pin-go-live timestamp set by the Owner.
REASON: Amazon/FTC affiliate disclosure is a mandatory Content QA item (17_AMAZON_COMPLIANCE.md, SOC-04).
STATUS: ACTIVE

DATE: 2026-09-13
DECISION: Dashboard data is served by the API (`GET /dashboard/overview`); the web `/dashboard` page fetches it server-side. Web does not touch the database.
REASON: Single DB access boundary (API) per architecture; keeps web simple and avoids leaking DB secrets to browsers.
STATUS: ACTIVE
