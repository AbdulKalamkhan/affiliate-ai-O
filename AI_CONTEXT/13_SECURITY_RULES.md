# 13_SECURITY_RULES.md

1. Least-privilege permissions for every seller/affiliate/social account connection.
2. Secrets: never in AI_CONTEXT, never in logs, never in browser/client code, never in Git. Use encrypted storage or a secrets manager; reference by ID, not value.
3. Every approval record must include: approver, action type, target account, target object/version, evidence, timestamp, expiration. Expired or version-mismatched approvals must be rejected automatically.
4. n8n workflows: authenticated calls only, scoped/signed execution tokens, job ID + idempotency key, no secrets embedded in workflow JSON. NestJS remains the authoritative permission boundary — n8n never decides business policy.
5. Audit every sensitive action — no silent failures, no silently-assumed success.
6. Run SEC-01 (Governance Review) periodically — see AI_OS_Agent_Documentation.md Section 15.
