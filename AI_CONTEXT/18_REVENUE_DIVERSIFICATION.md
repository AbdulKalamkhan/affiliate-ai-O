# 18_REVENUE_DIVERSIFICATION.md

## Why this file exists
Depending on a single affiliate network (Amazon) is a single point of failure — accounts get suspended over policy violations, low sales, or review issues.

## Rules
- `affiliate_programs` / `affiliate_offers` tables must support multiple networks by design — no Amazon-only hard-coding anywhere in core logic (Affiliate-01).
- Add a second network only **after** the Phase 00 gate passes, unless Owner explicitly changes scope (Affiliate-07).
- Candidate backup networks: Flipkart Affiliate, EarnKaro, Cuelinks (India-focused); CJ Affiliate/ShareASale (international).
- Track "revenue concentration %" as a CEO KPI. If one network exceeds 90% of revenue, surface it as a flagged risk in the CEO report — not just a passive stat.

## Current state
Single network in use: Amazon Associates (100% concentration — expected at MVP stage, revisit after Phase 00 gate).
