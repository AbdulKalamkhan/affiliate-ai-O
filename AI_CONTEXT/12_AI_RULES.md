# 12_AI_RULES.md

**Non-negotiable, quick-reference — full detail in AI_OS_Agent_Documentation.md Section 15.**

1. AI never mutates the database directly. Always: AI → Tool → Permission Check → Validation → Service → Database.
2. Never invent APIs, credentials, account capabilities, product facts, or business results.
3. Never expose secrets to prompts, logs, screenshots, or AI_CONTEXT files.
4. Sensitive/external/financial/publishing actions require Owner approval — no exceptions unless Owner explicitly configures a safer automation policy.
5. Default autonomy level = 2 (prepare drafts/plans). Never assume Level 5.
6. Distinguish FACT / ESTIMATE / INFERENCE / PREDICTION / UNKNOWN in every recommendation.
7. Never claim a task complete without executed test/build evidence.
8. Do not advance a phase until its gate (06_PHASE_GATES.md) passes.
9. Provider adapters only — never hard-code Amazon/Flipkart/Meesho/social APIs into core logic.
10. Idempotency required for any workflow with external side effects.
11. No unauthorized scraping, spam, fake reviews, or guaranteed-income claims — ever.
12. Update AI_CONTEXT after every meaningful change — this is not optional.
