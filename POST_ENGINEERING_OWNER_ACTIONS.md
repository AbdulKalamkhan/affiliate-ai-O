# POST_ENGINEERING_OWNER_ACTIONS.md

This document lists ONLY actions that genuinely require Owner or external provider intervention. No secrets are included. All engineering work is complete; business validation requires real external evidence/credentials.

## 1. Real AI Provider (LLM)
**ACTION:** Configure a real AI provider credential (if desired).  
**WHY REQUIRED:** AI provider abstraction exists and is fail-closed, but no real LLM credential is configured in any environment.  
**EXACT PROVIDER:** One of `openai_compatible`, `anthropic`, `google`, `local` (as implemented in `apps/api/src/ai/ai-types.ts`).  
**EXACT ENV VARIABLE NAME(S):**
- `AI_DEFAULT_PROVIDER` (optional; e.g. `openai_compatible`)
- Provider-specific credential (per provider implementation). See `apps/api/src/ai/providers/http-ai.provider.ts` and `.env.example`.

**WHERE TO CONFIGURE:** Render dashboard (or deployment environment) for `ai-os-api`. Do NOT commit secrets.  
**HOW TO VERIFY:** After setting credentials, call `GET /ai/status` (authenticated). Provider should show `configured` (or transition to `verified` only after a successful real call). A provider is only reported as `verified` after an actual successful invocation — configuration alone is not sufficient.  
**EXPECTED SUCCESS STATE:** `anyConfigured=true`, provider health `status=configured` (verified appears only after real call).  
**SECURITY WARNING:** Server-side only. Never expose to browser. Fail-closed is preserved.

---

## 2. Amazon Seller (Marketplace)
**ACTION:** Provide Amazon Seller API credentials/endpoint access (if read-only verification desired).  
**WHY REQUIRED:** Marketplace adapters exist (`apps/api/src/seller/marketplace/*`) but no credentials/transports verified.  
**EXACT PROVIDER:** Amazon Seller  
**EXACT ENV VARIABLE NAME(S):** TBD per adapter contract (if not yet specified). Review `marketplace-adapters.ts` and adapter interfaces before setting.  
**WHERE TO CONFIGURE:** Render `ai-os-api` environment variables (server-side only).  
**HOW TO VERIFY:** Authenticated read-only health/check against adapter (do NOT write/delete). Verify status becomes `CONNECTED` only after successful authenticated read.  
**EXPECTED SUCCESS STATE:** Marketplace registry reports `CONNECTED` (read-only verified).  
**SECURITY WARNING:** Read-only verification preferred. No write operations. Credentials never exposed client-side.

---

## 3. Flipkart (Marketplace)
**ACTION:** Provide Flipkart API credentials (if integration desired).  
**WHY REQUIRED:** No credentials/transports verified.  
**EXACT PROVIDER:** Flipkart  
**EXACT ENV VARIABLE NAME(S):** Per marketplace adapter contract (inspect existing adapter before configuration).  
**WHERE TO CONFIGURE:** `ai-os-api` environment (server-side).  
**HOW TO VERIFY:** Authenticated read-only verification only.  
**EXPECTED SUCCESS STATE:** `CONNECTED` only after successful read-only verification.  
**SECURITY WARNING:** No destructive/write operations during verification.

---

## 4. Meesho (Marketplace)
**ACTION:** Provide Meesho API credentials (if integration desired).  
**WHY REQUIRED:** No credentials/transports verified.  
**EXACT PROVIDER:** Meesho  
**EXACT ENV VARIABLE NAME(S):** Per marketplace adapter contract.  
**WHERE TO CONFIGURE:** `ai-os-api` environment (server-side).  
**HOW TO VERIFY:** Authenticated read-only verification only.  
**EXPECTED SUCCESS STATE:** `CONNECTED` only after successful read-only verification.  
**SECURITY WARNING:** Read-only only.

---

## 5. n8n / Automation External Services
**ACTION:** Configure n8n/Redis/BullMQ if external automation required (optional).  
**WHY REQUIRED:** Current implementation uses DB-backed queue as authoritative; external services disconnected by design.  
**EXACT PROVIDER:** n8n/Redis/BullMQ (as applicable)  
**EXACT ENV VARIABLE NAME(S):** As defined by deployment (if enabled).  
**WHERE TO CONFIGURE:** Deployment environment if external automation enabled.  
**HOW TO VERIFY:** Connection test without executing business actions.  
**EXPECTED SUCCESS STATE:** `CONNECTED` only after successful transport+auth verification.  
**SECURITY WARNING:** Optional. Do not enable external automation unless required.

---

## 6. Amazon Associates / Affiliate Attribution Evidence
**ACTION:** Provide/enable access to real Amazon Associates order/commission/attribution evidence (if available).  
**WHY REQUIRED:** Existing state: 1 campaign (`zorajewellery-21`), 1 published asset, 4 verified clicks, 0 verified conversions. Revenue/commission/profit remain `UNKNOWN / Awaiting verified data`. Business validation requires real evidence.  
**EXACT PROVIDER:** Amazon Associates  
**EXACT ENV VARIABLE NAME(S):** `ASSOCIATE_TAG` already set (`zorajewellery-21`) in render.yaml. Additional reporting/ingestion credentials only if programmatic earnings ingestion is desired.  
**WHERE TO CONFIGURE:** Render `ai-os-api` (server-side) if adding reporting credentials.  
**HOW TO VERIFY:** Ingest ONLY real, authorized evidence. Verify conversions appear only when backed by verifiable order/commission records. Do NOT infer from clicks.  
**EXPECTED SUCCESS STATE:** Verified conversions ≥ 0 backed by evidence; financial fields updated ONLY when evidence exists. If no evidence, remain `UNKNOWN`.  
**SECURITY WARNING:** Evidence-only ingestion. No scraping. Respect Amazon Associates terms. Preserve audit trail with source metadata.

---

**NOTE:** All items above are BLOCKED_EXTERNAL_CREDENTIAL/optional. Engineering is complete (PASS). Business validation remains PENDING REAL-MONEY EVIDENCE until real verified evidence exists. No secrets are printed here. No code changes requested.
