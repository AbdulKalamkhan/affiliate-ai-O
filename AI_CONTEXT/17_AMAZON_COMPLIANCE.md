17_AMAZON_COMPLIANCE.md

Hard constraints — enforce in code via the amazon-compliance module, not just as documentation:

Disclosure: FTC/Amazon-required affiliate disclosure on every page/post containing an affiliate link. Mandatory Content QA checklist item.
Cookie window: 24 hours (not 90 days). Commission Tracking must model this correctly.
PA-API access: requires (a) an approved Associates account, (b) Operating Agreement compliance, and (c) 10 qualifying sales in the trailing 30 days — this must be maintained continuously, not just met once, or access is revoked. Below this threshold, use SiteStripe or manual link generation instead of PA-API automation. Track "qualifying sales in trailing 30 days" as a system health metric.
No email-based promotion of naked affiliate links. No misleading price/availability claims. No incentivized clicks.
No automated fake reviews — explicit Content QA rejection rule.
Price/availability data must be refreshed regularly, not cached indefinitely.

Content QA agent must call this rules engine before any publish action reaches the Approval Gate.
