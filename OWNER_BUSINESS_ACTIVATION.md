# OWNER_BUSINESS_ACTIVATION.md

**Status:** ENGINEERING COMPLETE | BUSINESS MEASUREMENT READY | BUSINESS VALIDATION PENDING REAL EVIDENCE

No code changes required. System is ready to ingest authoritative business evidence.

## 1. CRITICAL (Required for Business Validation)

### A. Amazon Associates Evidence (REQUIRED)
**Action:** Provide authoritative Amazon Associates report/evidence  
**Tracking ID:** `zorajewellery-21`  
**What to provide:**
- Amazon Associates Earnings/Orders report covering the relevant period
- Include: clicks, ordered items, shipped items, cancellations/returns, commission/earnings
- Reporting period (start/end dates)

**How it will be used:** System will reconcile only supported fields. Attribution validated against tracking ID. Financial values only updated with authoritative evidence (UNKNOWN preserved if insufficient).

**Verification:** Conversions/commission appear only when backed by verifiable evidence.

---

## 2. OPTIONAL (Enable Additional Integrations)

### B. AI Provider (Optional)
**Provider options:** `openai_compatible`, `anthropic`, `google`, `local`  
**Env vars (server-side only):** `AI_DEFAULT_PROVIDER` + provider credential(s)  
**Where:** Render `ai-os-api` environment  
**Verify:** `GET /ai/status` shows configured/verified after successful call (read-only first)

### C. Amazon Seller / Flipkart / Meesho (Optional)
**Action:** Provide API credentials if seller integrations desired  
**Where:** Render `ai-os-api` (server-side only)  
**Verify:** Read-only authentication/connectivity test. No writes performed automatically.

### D. Automation (Optional)
**n8n/Redis/BullMQ:** Not required (DB-backed queue is authoritative)

---

## Notes
- No secrets included in this document. Configure credentials in deployment environment only.
- Business validation remains **PENDING** until authoritative Amazon evidence is provided.
- System follows evidence-only principle: UNKNOWN never converted to 0 without proof.
- Engineering is 100% complete and production-ready.
