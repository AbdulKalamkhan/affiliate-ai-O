# 02_ARCHITECTURE.md

## Hierarchy
```
OWNER → BOSS / AI CEO → Orchestrator → Specialist Agents → Tool Gateway →
Workers/APIs (n8n) → Approval Gate → Execution → Analytics → CEO Memory → (back to AI CEO)
```

## Security boundary (never violate)
```
FORBIDDEN: AI Model → Direct Database Mutation
REQUIRED:  AI → Tool → Permission Check → Validation → Service → Database
```

## Repository structure (D: drive)
```
D:\Affiliate-AI-OS\
├── apps\ (web, admin, api)
├── packages\ (database, ui, types, validation, config, ai-core, agents, tool-gateway, analytics, shared)
├── ai\ (ceo, orchestrator, agents, memory, policies, evaluation)
├── modules\ (intelligence, opportunities, products, affiliates, campaigns, content-factory,
│             analytics, approvals, automation, health, amazon-compliance, seller, social)
├── infrastructure\ (database, workers, queues, automation)
├── scripts\
├── tests\ (unit, integration, e2e)
├── docs\
├── AI_CONTEXT\
└── storage\ (research, products, content, creatives, exports, logs)
```

## Tech stack
- Frontend: Next.js + TypeScript (web, admin)
- Backend: NestJS + TypeScript (api)
- Database: PostgreSQL + Prisma (migrations only, no shortcuts)
- Automation: n8n (execution layer only, never the policy layer)
- Queue/Workers: BullMQ / Redis where needed
- AI: Ollama-first (local), optional Gemini/other adapters, never a hard dependency
- Monorepo: Turborepo
- CI: GitHub Actions (typecheck, lint, test, build)
- Auth: NextAuth.js (Auth.js)
- Analytics dashboard: Metabase (from Phase 08 onward) — don't build custom charts before then

## Full detail
See `AI_OS_Agent_Documentation.md` sections 2–11 for the complete system hierarchy, business workflow, Seller/Affiliate/AI/Social/n8n engine specs, QA gates, and database contract.
