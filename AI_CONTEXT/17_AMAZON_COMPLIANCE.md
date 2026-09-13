# 17_AMAZON_COMPLIANCE.md

Hard constraints — enforce in code via the `amazon-compliance` module, not just as documentation:

1. **Disclosure:** FTC/Amazon-required affiliate disclosure on every page/post containing an affiliate link. Mandatory Content QA checklist item.
2. **Cookie window:** 24 hours (not 90 days). Commission Tracking must model this correctly.
3. **PA-API access:** requires 3 qualifying sales in a rolling 180-day window or access is revoked. Track "days since last qualifying sale" as a system health metric.
4. **No email-based promotion** of naked affiliate links. No misleading price/availability claims. No incentivized clicks.
5. **No automated fake reviews** — explicit Content QA rejection rule.
6. **Price/availability data** must be refreshed regularly, not cached indefinitely.

Content QA agent must call this rules engine before any publish action reaches the Approval Gate.
