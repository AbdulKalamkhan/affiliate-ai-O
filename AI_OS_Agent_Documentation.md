# AI_OS — Affiliate AI CEO & Money Operating System
### Complete Architecture + Workflow + Implementation Task Prompts for OpenCode / Coding Agents

Canonical source: AI_OS Consolidated Master Specification v5 + supplied system architecture diagram

> **Purpose:** This document converts the visual architecture into an executable engineering contract. It tells a coding agent what the system is, how data and approvals flow, where n8n fits, how Seller + Affiliate + Social Media engines interact, and provides implementation prompts for each major task.

**Authority model:** OWNER → BOSS / AI CEO → specialist engines/workers. The Owner is the final authority. The Boss is the operating executive, not the owner.

---

## 1. Executive Summary

AI_OS is a controlled commerce operating system for two connected business engines: **Seller Engine** and **Affiliate Engine**. It also contains a Social Media publishing layer and an AI tool layer. The Boss/AI CEO coordinates research, validation, scoring, profit analysis, campaign creation, QA, approvals, execution, analytics, and learning.

The system must optimize for **verified profit**, not agent activity. Every important external action must be auditable. Sensitive, financial, listing, and publishing actions remain behind permissions and Owner approval according to the configured autonomy level.

Key capabilities that must remain explicit in implementation:
- Marketplace seller accounts (Amazon Seller Central, Flipkart Seller Hub, Meesho Supplier Panel)
- Seller listing automation
- Inventory/order/settlement synchronization
- Owner-controlled social accounts (YouTube, Instagram, Pinterest)

**n8n** is the workflow automation/orchestration layer. It should **not** become the business brain. The Boss decides or prepares actions; n8n executes approved, deterministic workflows and reports results back to the API/analytics layer.

### Core Loop
```
OWNER GOAL → BOSS → RESEARCH / DATA → VALIDATE → SCORE → PROFIT CHECK →
DECIDE → CREATE SELLER / AFFILIATE CAMPAIGN → QA → OWNER APPROVAL →
n8n / API EXECUTION → MARKETPLACE / SOCIAL PUBLISH → TRAFFIC / ORDERS →
REVENUE → PROFIT → ANALYTICS → AI MEMORY → BETTER NEXT DECISION
```

---

## 2. System Hierarchy

| Layer | Responsibility | Must NOT do |
|---|---|---|
| **OWNER** | Strategy, goals, credentials ownership, final approval, sensitive decisions. | Never delegated as an AI identity. |
| **BOSS / AI CEO** | Orchestrates the business; researches, plans, scores, recommends, prepares actions, reports. | Never bypass approval or directly mutate DB. |
| **Specialist AI** | Research, content, image, scoring, QA, optimization. | Never publish directly unless policy permits through controlled gate. |
| **n8n** | Repeatable workflow execution, scheduling, API calls, syncs, notifications, retries. | Never decide business strategy autonomously. |
| **NestJS API** | Authoritative business/service boundary, permissions, validation, audit, transactions. | Never trust client-side authority. |
| **PostgreSQL + Prisma** | System of record for business state, audit, metrics, memory. | No schema changes outside migrations. |
| **Next.js Dashboard/Admin** | Owner command center, approvals, monitoring, reports. | No secrets in client bundle. |

**Recommended autonomy default:** Level 2 — prepare drafts/plans. Safe internal actions can be Level 3. External execution can reach Level 4 only after explicit approval. Level 5 is not assumed.

---

## 3. Complete Business Workflow

1. **Owner Command** — Owner gives a goal (find profitable products, create listings, grow traffic, improve a campaign).
2. **Boss Interprets** — AI CEO converts the goal into structured tasks, constraints, required permissions, success metrics.
3. **Research + Existing Data** — Market trends, product demand, competitor signals, supplier cost, previous campaigns, seller results, affiliate offers, traffic/revenue data.
4. **Validate** — Check evidence quality, feasibility, policy restrictions, product/listing completeness, data freshness, source reliability.
5. **Score** — Calculate opportunity/product scores using evidence. Separate FACT / ESTIMATE / INFERENCE / PREDICTION / UNKNOWN.
6. **Profit Check** — Estimate revenue, commissions/sales, marketplace fees, product cost, fulfillment/returns, content cost, automation cost, risk. Never represent estimates as guaranteed income.
7. **Decide** — KEEP / IMPROVE / KILL for opportunities; campaigns also get DUPLICATE / SCALE / PAUSE.
8. **Create** — Generate seller listing assets and/or affiliate campaign assets. Content AI handles copy; Image AI handles visuals; Gemini/other research AI handles reasoning.
9. **QA Gates** — Two independent gates: Marketplace/Network Compliance QA and Content Quality QA. Both must pass before publish.
10. **Owner Approval** — Owner reviews the final action package. Approval is explicit and auditable.
11. **Execute** — n8n triggers approved workflow(s) via marketplace/social APIs or controlled manual handoff where API capability is unavailable.
12. **Measure** — Capture impressions/reach, clicks/views, orders/conversions, sales/commissions, fees, net profit.
13. **Learn** — AI updates memory with what worked, what failed, evidence strength, reusable strategy patterns.
14. **Repeat** — Next opportunity/campaign starts with new evidence and improved decision rules.

---

## 4. Seller Engine — Detailed Workflow

The Seller Engine converts Owner-provided product information into marketplace-ready listings and manages listing publication, sync, orders, inventory, tracking, returns/refunds, settlement/profit.

**Seller marketplaces:** Amazon Seller Central, Flipkart Seller Hub, Meesho Supplier Panel — each behind a provider adapter so the core Seller Engine is marketplace-neutral.

### Seller-01 — Product Intake
```
Implement a Seller Product Intake module.
- Accept product images, product details, supplier/cost info, category info.
- Validate required fields and image metadata.
- Store original inputs separately from AI-generated outputs.
- Create an immutable audit event for intake.
- Do not publish anything. Do not invent missing product facts.
Verification: unit tests (valid/invalid input), API integration test, evidence written to AI_CONTEXT.
```

### Seller-02 — Listing Generation
```
Implement listing generation: deterministic service + AI-assisted draft generation.
Generate: title, description, bullet points, keywords/tags, attributes/variants, pricing suggestion, inventory plan.
Rules: AI may draft; server validates. Never fabricate specs. Preserve supplier facts as source evidence.
Store prompt/model/version and output provenance. Human approval required before external publication.
Verification: schema/API tests, golden fixtures for ≥3 products, audit trail exists.
```

### Seller-03 — Listing Optimization
```
Build Seller Listing Optimization.
Inputs: current listing, search terms, competitor observations, conversion data, policy constraints.
Outputs: SEO improvements, keyword mapping, competitor comparison, conversion optimization suggestions.
Do not overwrite the live listing automatically — create a versioned proposed revision + explanation.
Add tests proving the live listing stays unchanged until approval.
```

### Seller-04 — Listing Validation
```
Implement independent checks: marketplace policy/restricted-word, required-attribute validation,
image quality/completeness, duplicate/near-duplicate detection, pricing sanity, variant consistency.
A listing cannot reach publish-ready status if any mandatory check fails.
Return machine-readable pass/fail reasons + evidence references.
```

### Seller-05 — Listing Output
```
Implement listing output packaging: marketplace-specific payload, bulk upload representation
where supported, Owner preview, approval package.
Store a normalized internal representation + provider-specific transformed representation.
Never couple the DB schema directly to one marketplace's payload format.
```

### Seller-06 — Marketplace Adapter Layer
```
Create a provider adapter interface. Required conceptual operations:
create listing, update listing, sync price, sync stock, fetch orders,
fetch shipment/tracking status, fetch returns/refunds (where supported),
fetch settlement/payout data (where supported).
Each adapter exposes capability metadata so unsupported operations fail safely.
```

### Seller-07 — Seller Account & Permission Management
```
Implement seller account records + permission boundaries for Amazon Seller Central,
Flipkart Seller Hub, Meesho Supplier Panel.
Store only encrypted/secret references; never expose secrets in AI prompts or logs.
Track connection state, permissions, expiry/rotation, last successful sync.
Implement safe disconnect path; audit all credential-related operations.
```

### Seller-08 — Publish / Update Gate
```
Flow: draft → validation → QA → Owner approval → approved action token →
n8n/API execution → provider result → audit.
An approval must be scoped to a specific listing/version/action and expire.
Reject stale approvals when listing content changed after approval.
```

### Seller-09 — Inventory / Order / Tracking Sync
```
Implement scheduled seller sync workers.
Pull inventory/order/tracking data from adapters. Normalize marketplace-specific states.
Use idempotency keys. Retry transient failures with bounded backoff.
Never duplicate orders. Record last sync cursor/time + errors. Surface failed syncs to dashboard.
```

### Seller-10 — Returns / Refunds / Settlement
```
Implement seller financial reconciliation.
Capture orders, marketplace fees, refunds/returns, settlements/payouts, net profit inputs.
Never call gross sales equal to profit. Every financial record preserves source, timestamp,
reconciliation status. Flag mismatches for Owner review.
```

---

## 5. Affiliate Engine — Detailed Workflow

Distinct from the Seller Engine — promotes products from Amazon or other affiliate networks without owning the product. Core must be network-neutral.

### Affiliate-01 — Provider Abstraction
```
Implement an affiliate provider interface for: affiliate program, offer/product, tracking link,
click event, conversion/revenue event, commission event, payout/reconciliation state.
Amazon must be an adapter, not a hard-coded dependency.
Adding a second network should require adapter/config work, not a rewrite.
```

### Affiliate-02 — Opportunity Discovery
```
Implement evidence-backed opportunity discovery.
Inputs: market trends, product demand, competition, audience signals, existing results, research sources.
Output a normalized opportunity record with evidence references.
Do not treat a trend as a profit opportunity.
Every recommendation identifies FACT/ESTIMATE/INFERENCE/PREDICTION/UNKNOWN items.
```

### Affiliate-03 — Opportunity Scoring
```
Implement the canonical opportunity score:
Demand + Trend + Product Quality + Commission + Conversion Potential + Content Potential +
Audience Fit + Market Gap + Seasonality − Competition − Risk − Cost − Execution Difficulty − Uncertainty.
Make weights/configuration explicit and versioned. Store component scores + evidence.
```

### Affiliate-04 — Profit Check
```
Implement financial evaluation for affiliate opportunities.
Calculate expected revenue, expected commission, traffic assumptions, conversion assumptions,
content/automation costs, provider costs, risk.
Clearly separate actuals from estimates. Output KEEP/IMPROVE/KILL with confidence + evidence.
```

### Affiliate-05 — Link Generator + Click Tracking
```
Implement affiliate link generation and click tracking.
Store provider, offer, campaign, destination, tracking parameters, timestamps.
Use privacy-aware identifiers. Protect redirect endpoints from abuse; validate destinations.
```

### Affiliate-06 — Conversion / Commission / Profit Reconciliation
```
Implement revenue event → commission event → profit record pipeline.
Do not infer a commission from a click. Only mark verified commission when supported by
provider/network evidence. Keep source evidence + reconciliation status.
Model provider attribution rules through the appropriate adapter.
```

### Affiliate-07 — Revenue Diversification
```
Implement revenue concentration KPI.
If one affiliate network exceeds 90% of revenue, create a risk alert for the CEO report.
Keep network adapters independent. Add the second provider only after the Money-First MVP gate
unless the Owner explicitly changes scope.
```

---

## 6. AI Tool Layer

Specialized AI capabilities rather than one model doing everything.

### AI-01 — Boss / AI CEO Orchestrator
```
Responsibilities: interpret Owner commands, inspect business state, request research,
assemble evidence, create plans, recommend decisions, request approval, dispatch approved
actions, summarize results, update memory.
Governance: default autonomy Level 2. No unrestricted external execution. No direct DB
mutation by model-generated code. All tool calls go through typed server-side tools.
All significant actions are audited.
```

### AI-02 — Gemini Research Adapter
```
Implement Google Gemini as an optional research/reasoning adapter.
Use cases: deep research, market analysis, trend detection, strategy planning, idea generation.
Must be optional and replaceable. Never expose API keys to prompts/browser/logs.
Record provider/model metadata + cost. Gracefully fall back when unavailable.
```

### AI-03 — Content AI Adapter
```
Provider-neutral Content AI interface. Capabilities: SEO/AEO/GEO copy, social captions,
scripts, hooks, product descriptions, revisions, optimization.
Store generated drafts, provenance, QA status, version history. No direct publishing from the model.
```

### AI-04 — Image Editing AI Adapter
```
Image-generation/editing abstraction. Capabilities: background removal, product image cleanup,
thumbnails/banners, infographics, creative variants.
Store original asset, generated derivative, prompt/instruction metadata, model/provider,
approval status. Never overwrite the original asset.
```

### AI-05 — AI QA
```
AI-assisted QA only as a support layer. Mandatory checks: originality/depth,
duplication/fingerprint, value, spam risk, policy restrictions, factual consistency.
AI QA cannot override hard server-side policy rules. Final pass/fail must be
deterministic and auditable where possible.
```

---

## 7. Owner Social Media Accounts

Social accounts belong under the Owner. The Boss manages strategy and prepares approved actions; the social execution layer performs account-specific operations.

**Important:** every publish/update/delete requires an **approved action token** unless the Owner explicitly configures a safer automation policy — nothing auto-publishes without approval by default.

### SOC-01 — Social Account Registry
```
Implement social_accounts + permission metadata for YouTube, Instagram, Pinterest.
Store provider, account identity reference, scopes/permissions, expiry metadata, last sync.
Never store raw secrets in ordinary database fields or logs.
```

### SOC-02 — YouTube Workflow
```
Channel/account selection, video asset validation, title/description/tags, thumbnail,
playlist selection, upload/update/delete (where supported), scheduling, analytics fetch.
Every publish/update/delete requires an approved action token unless Owner configures
a safer automation policy.
```

### SOC-03 — Instagram Workflow
```
Reels and posts: prepare video/image, caption, hashtags, cover/thumbnail (where supported),
schedule/publish/update/delete (where provider capabilities permit), analytics retrieval.
Do not assume every action is available through every API — expose capability status,
fail safely.
```

### SOC-04 — Pinterest Workflow
```
Boards and pins: prepare image, title, description, destination link, board, schedule.
Track publish result, pin identifier, analytics.
Affiliate destinations must pass compliance + content QA before publication.
```

### SOC-05 — Social Content Factory
```
Reusable social content factory. Input: opportunity/campaign/product.
Output: channel-specific variants for YouTube, Instagram, Pinterest.
Idea → script/caption → visual brief → image/video assets → hashtags/keywords → QA package.
Avoid near-duplicate spam — store content fingerprints + campaign linkage.
```

---

## 8. n8n Automation Layer

n8n is the automation/workflow **worker** layer — not the Owner, not the AI CEO.

**Preferred pattern:** API creates an approved job → n8n executes → provider result returns → API records outcome → Boss analyzes.

**Rule:** Never put business authorization logic only inside an n8n workflow. NestJS remains the authoritative policy/permission boundary.

### N8N-01 — Secure n8n Boundary
```
Requirements: authenticated webhook/API calls, signed/scoped execution tokens,
job ID + idempotency key, no secrets embedded in workflow JSON,
execution logs avoid credential leakage, API remains authoritative for permission checks.
Document how n8n calls back into the API.
```

### N8N-02 — Seller Listing Publish Workflow
```
approved seller action → fetch approved listing version → final API validation →
marketplace adapter → provider response → persist result → notify Owner → audit event.
On failure: classify transient/permanent, retry only safe transient failures,
never silently mark success.
```

### N8N-03 — Seller Sync Workflows
```
Scheduled workflows for inventory, orders, tracking, returns/refunds, settlement.
Bounded retries, idempotency, checkpoints/cursors, dead-letter/error handling.
Each execution observable from the dashboard.
```

### N8N-04 — Social Publish Workflow
```
Separate workflow templates for YouTube, Instagram, Pinterest.
Input is an approved action package. Validate approval token + content version before
external action. Persist provider ID, status, timestamp, response metadata.
Support retry without duplicate publishing where provider supports idempotency.
```

### N8N-05 — Analytics Fetch Workflow
```
Scheduled analytics fetch jobs for seller and social channels.
Normalize raw metrics into campaign metrics. Record source + retrieval time.
Preserve historical snapshots/reconciliation history when a platform revises metrics.
```

### N8N-06 — Failure Recovery
```
Centralized n8n failure handling. Classify: auth failure, permission failure,
validation failure, provider rate limit, transient network failure, unknown failure.
Route to retry, pause, Owner approval, or manual resolution.
Write exact evidence to audit logs and AI_CONTEXT where it changes project state.
```

---

## 9. QA, Compliance and Approval Gates

| Gate | Checks | Failure behavior |
|---|---|---|
| **Marketplace / Network QA** | Marketplace policy, affiliate disclosure, link integrity, restricted terms, price/availability freshness, account health, provider capability. | Block publish; record exact reason. |
| **Content Quality QA** | Originality, depth, duplication/fingerprint, factual quality, value, spam risk, channel fit, visual quality. | Block publish; create revision task. |
| **Security / Permission QA** | Account scope, action authorization, approval token, secret availability, audit context. | Block execution. |
| **Owner Approval** | Owner reviews final payload/version/action and target account. | No external execution until explicit approval. |

### QA-01 — Unified Approval Gate
```
Implement a server-side approval gate combining:
1) marketplace/network compliance result, 2) content-quality result,
3) permission check, 4) action/version integrity check.
Create an approval record: approver, action type, target account, target object/version,
evidence, timestamp, expiration.
Execution must reject if approval is missing, expired, object version changed,
mandatory QA failed, or permission insufficient.
Add integration tests for every rejection case.
```

---

## 10. Database Contract

PostgreSQL + Prisma. All schema changes require migrations. DB is the system of record; AI outputs are proposed state until validated/approved.

**Core / Boss:** `users`, `boss_commands`, `boss_tasks`, `boss_plans`, `boss_actions`, `boss_approvals`, `boss_permissions`, `boss_memory`, `boss_tool_calls`, `boss_decisions`

**Business / Affiliate:** `opportunities`, `opportunity_signals`, `opportunity_scores`, `products`, `product_scores`, `affiliate_programs`, `affiliate_offers`, `affiliate_links`, `campaigns`, `campaign_assets`, `campaign_metrics`, `revenue_events`, `commission_events`, `profit_records`, `trend_signals`, `competitor_records`, `research_sources`, `research_evidence`

**Seller:** `seller_accounts`, `seller_permissions`, `marketplaces`, `products_master`, `products_variants`, `listings`, `listing_versions`, `listing_action_logs`, `inventory`, `orders`, `order_items`, `shipments`, `returns`, `settlements`, `fees_charges`, `seller_profit_records`

**Social:** `social_accounts`, `social_content`, `social_posts`, `schedules`, `analytics`, `engagements`

### DB-01 — Canonical Schema Implementation
```
Inspect the current repository and implement/repair the DB schema per the AI_OS architecture.
Do not blindly copy a table list if existing code provides a stronger evidence-backed model.
First inspect current Prisma schema, migrations, package boundaries, AI_CONTEXT.
Then propose minimal additive schema changes.
Run format → validate → migration creation → client generation → tests.
Do not use invalid Prisma constructs or computed fields that belong in application services.
Report exact migration names, validation output, test evidence.
If DB is unavailable, stop at the smallest safe boundary and record the blocker.
```

---

## 11. Technical Architecture Contract

| Component | Technology / Rule |
|---|---|
| Frontend | Next.js + TypeScript; dashboard/admin; no secret exposure. |
| Backend | NestJS + TypeScript; typed services; authoritative policy and permissions. |
| Database | PostgreSQL + Prisma; migrations only. |
| Automation | n8n workflows; scheduled and event-driven jobs. |
| Queue / Workers | BullMQ / Redis where asynchronous workloads require durable jobs. |
| AI | Ollama/local first where hardware allows; optional Gemini/OpenAI/other adapters. |
| Images / Video | Provider-neutral adapters; preserve originals and provenance. |
| Infrastructure | Local-first; Docker optional; D: drive deployment. |
| CI | GitHub Actions: typecheck, lint, test, build. |

### ARCH-01 — Repository First-Boot Audit
```
1. Identify D:\Affiliate-AI-OS as the intended root; verify actual path.
2. Read AI_CONTEXT before changing code.
3. Inspect repository structure, package manifests, Prisma, apps, modules, workflows, tests.
4. Establish baseline: install state, typecheck, lint, test, build, DB connectivity.
5. Determine the current implementation phase from evidence.
6. Identify protected areas, blockers, incomplete integrations.
7. Produce an audit before implementation.
Do not rebuild or delete working code. Do not invent credentials or APIs.
```

---

## 12. Implementation Roadmap and Task Gates

| Phase | Name | Gate |
|---|---|---|
| 00 | Money-First MVP | Real click → conversion → commission tracked once. One channel only; manual publishing. |
| 01 | Foundation & AI CEO Core | Safe command → structured, auditable plan. |
| 02 | Opportunity Intelligence | Evidence-backed opportunity discovery, scoring, ranking. |
| 03 | Money / Affiliate Engine | Financial evaluation with revenue/cost/profit/ROI. |
| 04 | Content Factory | Campaign assets + SEO/AEO/GEO + QA + compliance. |
| 05 | Automation & Workers | Repeatable workflows, safe retries, failure recovery. |
| 06 | Campaign & Analytics | Attribution, profit and ROI measurable. |
| 07 | CEO Memory & Learning | Past outcomes influence recommendations. |
| 08 | Command Center | Owner controls system from dashboard. |
| 09 | Production Hardening | Security, tests, observability, backup/recovery. |
| 10 | Controlled Production | Scheduled intelligence + approved live execution. |
| 11 | Scale Architecture | Multi-provider, workers, multi-workspace SaaS foundation. |
| 12 | Continuous Optimization | Forecast/decision accuracy measurably improves. |

### PHASE-00
```
Build only the Money-First MVP.
- One affiliate channel. - Simple opportunity list. - affiliate_links + click tracking.
- revenue/commission/profit records. - Manual publishing. - Minimal dashboard.
Do not build the full automation platform before the money loop is proven.
Gate: one real click → conversion → commission with real evidence.
```

### PHASE-01
```
Build Foundation + AI CEO Core after Phase 00 gate passes.
Owner command intake, boss_commands/tasks/plans/actions, typed tool contracts,
permission checks, audit logs, structured plan generation.
Gate: safe Owner command produces a structured, auditable plan without external execution.
```

### PHASE-02
```
Build evidence-backed opportunity intelligence.
Research sources/evidence, trend signals, opportunity normalization, scoring.
Every recommendation distinguishes FACT/ESTIMATE/INFERENCE/PREDICTION/UNKNOWN.
Gate: repeatable evidence-backed ranked opportunities.
```

### PHASE-03
```
Build the Money/Affiliate Engine.
Provider adapters, offers, links, click events, conversion/commission reconciliation,
profit calculation, revenue concentration KPI.
Gate: financial evaluation and actual outcome tracking are trustworthy.
```

### PHASE-04
```
Build the Content Factory.
Content generation, image workflows, campaign assets, fingerprints, content QA,
network compliance QA.
Gate: campaign assets reach publish-ready state only after both QA gates pass.
```

### PHASE-05
```
Build n8n automation and workers.
Approved-job execution, scheduled syncs, retries, idempotency, dead-letter/error handling,
notifications.
Gate: repeatable workflows execute safely and recover from defined failure classes.
```

### PHASE-06
```
Build campaign analytics.
Normalize seller, affiliate, social outcomes into campaign metrics.
Measure reach/impressions, clicks/views, orders/conversions, revenue/commission, fees, profit.
Gate: campaign ROI/profit can be evaluated from recorded evidence.
```

### PHASE-07
```
Build CEO memory and learning.
Store successful/failed decisions, evidence strength, strategy patterns, reusable lessons.
Gate: prior outcomes measurably affect a later recommendation.
```

### PHASE-08
```
Build the Owner Command Center.
Dashboard for commands, approvals, accounts, campaigns, seller listings, social publishing,
analytics, alerts, AI recommendations.
Gate: Owner can operate the business from one controlled dashboard.
```

### PHASE-09
```
Production hardening.
Security review, secret handling, audit completeness, tests, observability, backups,
real restore test.
Gate: all required hardening checks pass with evidence.
```

### PHASE-10
```
Controlled production.
Enable scheduled intelligence and approved live publishing.
Enforce autonomy levels and account permissions.
Gate: live operations are governed, observable, reversible.
```

### PHASE-11
```
Scale architecture.
Multi-provider adapters, worker scaling, workspace isolation, role-based access,
SaaS foundations.
Add DPDP-related consent, deletion, retention controls before external-user go-live.
```

### PHASE-12
```
Continuous optimization.
Measure forecast accuracy, recommendation quality, campaign performance improvement over time.
Gate: measurable improvement, not merely more activity.
```

---

## 13. Accounts, Permissions and Integrations

### ACC-01 — Account Registry
```
Unified account registry for seller, affiliate, social accounts.
Each account has provider type, owner, status, scopes/capabilities, connection metadata,
audit history. Keep provider-specific details behind adapters.
```

### ACC-02 — Secrets
```
Rules: never store secrets in AI_CONTEXT, never print secrets in logs, never expose
secrets to browser code, encrypt or use a secure secret reference, support
rotation/revocation, audit access without recording the secret value.
```

### ACC-03 — Capability Discovery
```
For every integration, expose capabilities (publish, update, delete, analytics,
inventory sync, order sync, etc). The UI and Boss must know whether an operation is
supported before preparing an action.
```

### ACC-04 — Connection Health
```
Health checks for integrations. Track last success, last failure, error class,
permission status, expiry/rotation warnings, sync lag. Create Owner alerts for
broken critical connections.
```

---

## 14. Results, Analytics and AI Learning

Results Flow: **Impressions/Reach → Clicks/Views → Conversions/Orders → Commissions/Sales → Profit.** Preserve provider-specific raw data and normalize comparable campaign metrics.

### AN-01 — Unified Metrics Model
```
Normalized campaign metrics while preserving raw provider metrics.
Support seller, affiliate, social source types. Every metric needs source,
retrieval timestamp, campaign linkage, aggregation rules.
Do not mix estimated and verified financial metrics.
```

### AN-02 — Profit Calculation
```
Seller profit: product/supplier cost, marketplace fees, fulfillment/shipping,
refunds/returns, other recorded costs.
Affiliate profit: commission revenue minus attributable content/automation/provider
costs where known. Keep calculation versions so historical results stay explainable.
```

### AN-03 — CEO Report
```
Daily/periodic CEO report: profit, revenue, conversion signals, campaign winners/losers,
seller account health, affiliate revenue concentration, social performance,
failed automations, pending approvals, major risks.
Every recommendation links back to evidence.
```

### AN-04 — Learning Loop
```
After campaign/listing outcomes, create a learning record: expected vs. happened,
evidence quality, root cause hypothesis, action taken, whether the lesson should
be reused. Do not treat a single noisy result as universal truth.
```

---

## 15. Security and Governance Non-Negotiables

- No AI direct database access. AI uses typed tools/services with server-side validation.
- All important actions are auditable.
- Human approval is mandatory for sensitive financial, listing, and publishing actions per policy.
- Secrets/API keys never appear in AI-visible prompts, logs, screenshots, memory files, or Git.
- No unauthorized scraping, credential dumping, spam, fake reviews, misleading claims, or guaranteed-income messaging.
- Affiliate disclosure and network/platform compliance are mandatory before publishing affiliate content.
- Price/availability data must be refreshed per provider policy; do not rely on indefinitely cached values.
- Least-privilege permissions for seller and social accounts.
- Idempotency for workflows with external side effects.
- Never claim completion without executing verification and recording evidence.

### SEC-01 — Governance Review Agent Prompt
```
Audit the current AI_OS implementation against the security/governance contract.
Check: AI-to-DB boundary, approval enforcement, secret leakage, audit completeness,
least privilege, n8n execution authorization, provider adapter isolation, idempotency,
content/network QA enforcement.
Return PASS/FAIL per control with exact evidence and remediation tasks.
Do not modify production behavior during the audit unless explicitly instructed.
```

---

## 16. AI_CONTEXT, Git and Multi-Session Continuity

Every coding session starts by reading AI_CONTEXT. The agent must update relevant state, decisions, change history, next action, integration records after meaningful changes.

**Git convention:** phase-prefixed branches (`phase-05/n8n-seller-publish`); Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`). Merge a phase only when its gate is verified. Tag phase releases.

### MEM-01 — End-of-Task Memory Update
```
At the end of every implementation task:
1. Summarize exactly what changed.
2. Record FACTS supported by command/test evidence.
3. Record ESTIMATES/INFERENCES separately.
4. Record blockers and unresolved UNKNOWNs.
5. Update current phase/status.
6. Update change history.
7. Update next action.
8. Update integration/decision records when relevant.
9. Include verification commands and outcomes.
Never write 'complete' without evidence.
```

---

## 17. Testing and Verification Contract

| ID | Type | Minimum scope |
|---|---|---|
| TEST-01 | Unit tests | Business calculations, scoring, policy rules, validators, adapters, idempotency. |
| TEST-02 | Integration tests | API → DB → service boundaries; approval gate; provider mocks. |
| TEST-03 | Workflow tests | n8n webhook/job inputs, retries, duplicate prevention, failure paths. |
| TEST-04 | E2E | Owner command → plan → approval → simulated execution → analytics. |
| TEST-05 | Security tests | Unauthorized action rejection, secret redaction, expired approvals. |
| TEST-06 | Regression | Existing working functionality must remain green after changes. |

### VERIFY-01 — Universal Completion Prompt
```
Do not claim this task is complete yet.
Execute the relevant typecheck, lint, unit/integration tests, build, runtime checks.
For integrations, run safe mocked tests if real credentials are unavailable.
Verify database migrations and schema state where applicable.
Verify no secrets were logged. Verify audit events exist for sensitive actions.
Report: implementation status, tests run, exact PASS/FAIL evidence, known limitations, next action.
If any required gate fails, mark the task BLOCKED/INCOMPLETE rather than complete.
```

---

## 18. Business Success Checkpoints

| Checkpoint | Question | If it fails |
|---|---|---|
| Day 14 / Phase 00 | Has at least one real click → conversion → commission been tracked? | Stop expanding architecture; fix traffic/offer/content mismatch. |
| Day 30 | Is there a repeatable conversion pattern? | Revisit niche/product/channel selection. |
| Day 60 | Is profit trending up campaign-over-campaign? | Reassess niche/channel before heavy automation. |
| Day 90 | Is the AI_OS investment paying back versus manual work? | Prioritize the proven manual path until the system proves ROI. |

---

## 19. MASTER START PROMPT FOR OPENCODE

**Copy this prompt to OpenCode verbatim:**

```
You are the Lead AI Architect, AI CEO Systems Engineer, and Autonomous Development
Agent for AI_OS — Affiliate AI CEO & Money Operating System.

SOURCE OF TRUTH
- Use the AI_OS Consolidated Master Specification v5 and this Agent Documentation.
- Read AI_CONTEXT first.
- Treat the repository as implementation truth and executed evidence as completion truth.
- Hierarchy: OWNER → BOSS / AI CEO → specialist engines/workers.
- The Owner is the final authority. The Boss is the operating executive, not the owner.

SYSTEM SCOPE
1) Seller Engine: product intake → listing generation → optimization → validation →
   output → marketplace publish/sync → inventory/orders/tracking → returns/refunds →
   settlements/profit.
2) Affiliate Engine: opportunity → research → validation → score → profit check →
   affiliate offer/link → campaign → click → conversion → commission → profit.
3) Social Media: Owner-controlled YouTube, Instagram, Pinterest accounts with
   channel-specific content and approved publishing workflows.
4) AI Layer: Boss/AI CEO, Gemini research/reasoning adapter, Content AI, Image
   Editing AI, optional local/free model adapters.
5) Automation: n8n as workflow execution/orchestration, never as the authoritative
   business-policy layer.
6) Analytics + Learning: unified metrics, profit, reports, CEO memory.

NON-NEGOTIABLES
- Never rebuild an existing repository without evidence.
- Never invent APIs, credentials, account capabilities, product facts, business results.
- Never expose secrets to prompts, logs, screenshots, or AI_CONTEXT.
- AI does not directly mutate the database.
- Sensitive/external actions require server-side permission and approval controls.
- Use provider adapters — Amazon/Flipkart/Meesho and social providers are not
  hard-coded into the core.
- Use idempotency for external side effects.
- Enforce Marketplace/Network QA and Content Quality QA before publish.
- Preserve original images/assets; store generated derivatives separately.
- Separate actuals from estimates.
- Distinguish FACT, ESTIMATE, INFERENCE, PREDICTION, UNKNOWN.
- Do not claim completion without executed verification.
- Do not advance a phase until its gate passes.
- IMPORTANT: this document describes the END-STATE architecture. Start at
  PHASE-00 (Money-First MVP) only, regardless of how complete the rest of this
  spec looks — do not build Seller+Affiliate+Social all at once.

N8N RULE
Use n8n for scheduled/event-driven execution, syncs, notifications, retries, and
external workflow steps. NestJS remains authoritative for authentication,
authorization, approval validation, business rules, and audit. A workflow must
receive a scoped job/action token and return a structured result.

SESSION PROTOCOL
1. Locate D:\Affiliate-AI-OS.
2. Read AI_CONTEXT start/state/rules/decisions/integrations.
3. Inspect repository, packages, modules, Prisma, tests, existing workflows.
4. Establish baseline.
5. Determine current phase from evidence.
6. Produce audit and plan.
7. Implement the smallest safe increment.
8. Verify.
9. Update AI_CONTEXT and git history.
10. Report exact evidence, blockers, next action.

WHEN ASKED TO IMPLEMENT A TASK
- Map the task to Seller, Affiliate, Social, AI, n8n, Analytics, Security, or
  shared infrastructure.
- Identify dependencies and protected boundaries.
- Produce a short implementation plan.
- Make additive changes where practical.
- Run relevant tests.
- Stop if a required external credential/API capability is unavailable; implement
  the adapter boundary/mock and record the blocker rather than faking success.

FINAL OPERATING LOOP
FIND → VALIDATE → SCORE → DECIDE → CREATE → QA → APPROVE → EXECUTE → MEASURE →
LEARN → COMPOUND.
```

---

## 20. Task Index — Quick Selection

| Area | Task prompts |
|---|---|
| Foundation | ARCH-01, DB-01, MEM-01, VERIFY-01 |
| Seller Engine | Seller-01 through Seller-10 |
| Affiliate Engine | Affiliate-01 through Affiliate-07 |
| AI Layer | AI-01 through AI-05 |
| Social Media | SOC-01 through SOC-05 |
| n8n | N8N-01 through N8N-06 |
| QA / Approval | QA-01 |
| Accounts / Integrations | ACC-01 through ACC-04 |
| Analytics / Learning | AN-01 through AN-04 |
| Security | SEC-01 |
| Phases | PHASE-00 through PHASE-12 |

**Recommended usage:** give OpenCode this documentation plus the AI_CONTEXT folder. For each session, select one task prompt, require the First-Boot Audit, implement only that scope, verify it, update memory, and stop at the phase gate.

---

## Appendix A — Important Interpretation Notes

- The visual architecture is broader than the Phase 00 MVP. The architecture describes the end-state; implementation must still follow the canonical phase gates.
- Seller automation is a dedicated engine and must not be confused with affiliate promotion.
- Social accounts are Owner-owned resources. The Boss coordinates them; the Owner remains final authority.
- n8n is present as the Automation layer and must be implemented as controlled workflow execution, not as a replacement for the backend.
- Marketplace and social API capabilities can change. Provider adapters must expose supported capabilities and fail safely when an operation is unavailable.
- The system should remain provider-neutral so a second affiliate network or marketplace can be added without rewriting the core.
- Real credentials and production account access are environment-specific and must never be embedded in this documentation.

---

## Appendix B — Platform Publishing Realities *(added — not in original PDF)*

These are practical constraints the coding agent should know when implementing SOC-02/03/04, since API access to these platforms has real-world limits the architecture doesn't mention:

- **Instagram/Facebook (Meta Graph API):** requires a Business or Creator account linked to a Facebook Page. Beyond a small usage threshold, Meta requires an App Review process before broader publishing permissions are granted — factor this into ACC-03 capability discovery rather than assuming full access from day one.
- **YouTube Data API:** has a daily quota (free tier is limited units/day; an upload consumes a large portion of it). Design the upload workflow to respect quota limits and queue gracefully rather than fail silently.
- **Pinterest API:** requires a Business account; organic pin publishing is generally more accessible than the other two, but affiliate-link pins must still carry proper disclosure per Pinterest's own policies, separate from Amazon/network rules.

None of this blocks Phase 00–08 development — but ACC-03 (Capability Discovery) and SOC-01 through SOC-04 should treat "full auto-publish access" as something to verify per-account, not assume by default.

---

*Document status: Engineering blueprint / agent handoff. Use with the canonical AI_OS v5 specification and the AI_CONTEXT starter folder.*
