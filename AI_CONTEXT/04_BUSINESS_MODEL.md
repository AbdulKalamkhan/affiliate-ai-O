# 04_BUSINESS_MODEL.md

## Revenue sources (in priority order)
1. Amazon Associates (affiliate) — starting point
2. Seller Engine (Amazon Seller Central / Flipkart Seller Hub / Meesho Supplier Panel) — own product reselling
3. Future: additional affiliate networks once Phase 00 gate passes (Flipkart Affiliate, EarnKaro, CJ Affiliate) — see Affiliate-07 revenue concentration KPI
4. Future (Phase 11+): SaaS — selling this platform to other affiliate marketers

## Money Engine formulas
```
Expected Revenue    = Traffic × Conversion Rate × Revenue per Conversion
Expected Commission = Clicks × Conversion Rate × Commission per Conversion
Expected Profit     = Expected Commission − Direct Costs
ROI                 = Expected Profit / Cost
```

## Opportunity Score
```
Demand + Trend + Product Quality + Commission + Conversion Potential + Content Potential +
Audience Fit + Market Gap + Seasonality − Competition − Risk − Cost − Execution Difficulty − Uncertainty
```

## Compliance constraints (hard rules, not suggestions)
- Amazon: FTC/disclosure required on every affiliate page/post; 24-hour cookie window (not 90 days); PA-API requires 3 qualifying sales per rolling 180 days or access is revoked; no email-promoted naked links; no fake reviews; no stale price/availability data.
- India tax: affiliate/seller income is taxable business income — this system does record-keeping only (profit_records), never auto-files or auto-remits. Consult a CA before filing.
- India data protection: DPDP Act 2023 applies once external SaaS users exist (Phase 11+) — consent capture, deletion mechanism, retention policy required before go-live.

## Success checkpoints (project-level, not just campaign-level)
| Day | Question | If it fails |
|---|---|---|
| 14 | 1 real click→conversion→commission tracked? | Stop expanding architecture, fix the mismatch |
| 30 | Repeatable conversion pattern found? | Revisit niche/product/channel |
| 60 | Profit trending up campaign-over-campaign? | Reassess before heavy automation |
| 90 | Is AI_OS paying back vs. manual work? | Prioritize proven manual path if not |
