# 14_MONEY_ENGINE.md

## Formulas
```
Expected Revenue    = Traffic × Conversion Rate × Revenue per Conversion
Expected Commission = Clicks × Conversion Rate × Commission per Conversion
Expected Profit     = Expected Commission − Direct Costs
ROI                 = Expected Profit / Cost
```

## Opportunity Score (weights should be explicit and versioned in code, not hidden)
```
Demand + Trend + Product Quality + Commission + Conversion Potential + Content Potential +
Audience Fit + Market Gap + Seasonality − Competition − Risk − Cost − Execution Difficulty − Uncertainty
```

## Decision rules
- Opportunities: KEEP / IMPROVE / KILL
- Campaigns: KEEP / IMPROVE / DUPLICATE / SCALE / PAUSE / KILL

| Signal | Action |
|---|---|
| High CTR + low conversion | Improve landing/product alignment |
| Low CTR + good conversion | Improve creative/hook |
| High conversion + good profit | SCALE |
| High traffic + no revenue | Investigate/PAUSE |
| High cost + low expected return | KILL |

## Revenue concentration rule
If one affiliate network exceeds 90% of total revenue, flag it as a risk in the CEO report (Affiliate-07). Never let a single provider become an unmonitored single point of failure.

## Never
Never represent an estimate as guaranteed income. Never call gross sales equal to profit — always subtract fees, costs, refunds/returns.
