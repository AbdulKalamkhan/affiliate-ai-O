# 10_CHANGE_HISTORY.md

**Append-only. One entry per meaningful change. Use Conventional Commits style prefixes to match git log.**

## Format
```
DATE | phase | commit-type: short description | evidence (tests run, PASS/FAIL)
```

## Log
2026-09-13 | 00 | docs: run ARCH-01 Repository First-Boot Audit — no code changes | evidence: repo inspection (no .git, no manifests), doc hash check (root vs package identical), node 24/npm 11/git 2.55 present, PostgreSQL service running on 5432, Ollama/n8n/Redis not running, secrets scan clean, PASS

2026-09-13 | 00 | chore: bootstrap Phase-00 monorepo (Turborepo + npm workspaces; apps/api NestJS 11, apps/web Next 15, tsconfig.base) | evidence: turbo typecheck/lint/test/build 12/12 PASS; api /health 200 {"status":"ok"}; web / serves "AI_OS — Phase 00 MVP"; PASS

2026-09-13 | 00 | chore(db): provision local PostgreSQL role/db `aios` (least privilege, no superuser) | evidence: psql connect as aios@aios reports pg 18.4; PASS

2026-09-13 | 00 | feat(db): add Phase-00 Prisma schema + init migration (affiliate_links, affiliate_link_clicks, revenue_events, profit_records) | evidence: prisma migrate dev applied 20260913132220_init; psql \dt shows 5 tables (incl _prisma_migrations); PASS

2026-09-13 | 00 | feat(db): add opportunities table + manual product fields on affiliate_links | evidence: migration 20260913135814_add_opportunities_and_product_fields applied; PASS

2026-09-13 | 00 | feat(task4): opportunities CRUD module (create/list/get/patch/delete + status validation) | evidence: jest PASS; live HTTP create/list/patch/delete OK, invalid status 400, missing 404; PASS

2026-09-13 | 00 | feat(task5): affiliate link generator + click-tracking redirect (manual tag, no PA-API; ProductDataProvider boundary left ready for PA-API) | evidence: jest 31 tests PASS (4 suites); live: tagged destination `...&tag=zorajewellery-21`, ASIN extracted, 302 + Location headers, _count.clicks=1, 404s, delete cascades; test rows cleaned (DB 0 rows); PASS

2026-09-13 | 00 | feat(db): add `Channel` enum (PINTEREST) on affiliate_links + `content_assets` table (pin title/description, link FK cascade, published/publishedAt, disclosureAdded) | evidence: migration 20260913142055_add_content_assets_and_channel applied; psql shows 6 business tables + _prisma_migrations; PASS

2026-09-13 | 00 | feat(task6): Pinterest manual-publishing wiring — channel as config enum (validated at link create, no hard-coded branch), content-asset CRUD with Amazon disclosure gate before publish | evidence: jest 42 tests PASS (5 suites); live: publish-without-disclosure 400, disclosure→publish OK with publishedAt, disclosure locked while published, unpublish clears date; 12/12 Turbo PASS; PASS

2026-09-13 | 00 | feat(task7): dashboard — API `GET /dashboard/overview` (clicks, conversions, reconciled revenue, profit, clicks-by-channel, recent lists; Decimal→number) + web `/dashboard` SSR page with empty states | evidence: live SSR rendered pin title, PINTEREST, "Published pins", Clicks=1 metric; overview JSON counts verified; test rows cleaned; PASS

2026-09-13 | 00 | chore(deploy): add Render blueprint `render.yaml` — free web service for the click-tracking API (build: npm ci + prisma generate + turbo build filter api; start: prisma migrate deploy + node dist/main.js; DATABASE_URL as secret; NODE_VERSION 24; ASSOCIATE_TAG) | evidence: pushed to github.com/AbdulKalamkhan/affiliate-ai-O (main). PUBLIC URL + real-click verification PENDING (Neon DB set by Owner as Render secret; migrations + endpoint test to be confirmed by Owner)

2026-09-14 | 00 | fix(deploy): add valid `runtime: node` to render.yaml (Render Blueprint rejected missing runtime as `services[0].runtime: invalid runtime`) | evidence: js-yaml parses OK (type=web runtime=node name=ai-os-api plan=free; build/start/env preserved; DATABASE_URL secret sync:false); pushed `a87a9be`

2026-09-14 | 00 | ops(verify): PRODUCTION technical gate EXECUTED and PASSED on Render+Neon — public URL `https://ai-os-api-1eck.onrender.com` | evidence: /health HTTP 200 {"status":"ok","service":"@ai-os/api","database":"not-checked"}; POST /affiliate-links 201 → destination `https://www.amazon.in/dp/B08N5WRWNW?tag=zorajewellery-21`; disclosure gate 400 before / 200 after; GET /affiliate-links/:id/click 302 Location contains tag=zorajewellery-21; link record _count.clicks=1; dashboard clicksByChannel={PINTEREST:1} (ONE CONTROLLED tech click, NOT real traffic); revenue/profit ₹0; smoke rows deleted after capture (DB back to 0 rows, clicksByChannel empty); git secret scan clean (only localhost placeholders). TECHNICAL GATE PASSED; BUSINESS GATE BLOCKED. PASS

2026-09-14 | 00 | ops(campaign): CAMPAIGN #1 (GIVA 925 silver zircon hoop earrings, ASIN B09DGJR1Z7) — product research + Owner approval + production link ASSET DRAFTED (NOT published) | evidence: live page re-verified — title "GIVA 925 Silver Rose Gold 18k gold Plated Zircon Hoop Earrings Semi Hoops", price ₹1,454 (−27%, MRP ₹1,998), IN STOCK, sold by VRP Telematics (Amazon Fulfilled), 3.7★ (179 ratings), 100+ bought/month, BIS 925 stamped, 6-month warranty, 10-day return, made in India; POST /affiliate-links 201 → {id cmu1m77qy0000ba1yzz4thfnu, channel PINTEREST, offer B09DGJR1Z7, campaign giva-rg-zircon-hoops-c1, price 1454 INR, destination https://www.amazon.in/dp/B09DGJR1Z7?tag=zorajewellery-21, _count.clicks 0}; GET :id 200 verified; POST /content-assets 201 → {id cmu1m9upy0002ba1ya9j1lmls, published false}; PATCH disclosureAdded:true 200 (published REMAINS false — awaiting Owner second approval to publish). Commission % UNVERIFIED (no PA-API). PASS

2026-09-15 | 00 | docs(ai): CAMPAIGN #2 opportunity research (research-only, NO production link/asset/DB rows) — 6 Amazon.in jewellery candidates scored live | evidence: live pages fetched 2026-09-15 (amazon.in delivery loc Udaipur 313702; Jaipur 303301 for B09R25NXDF). VERIFIED: (1) B08XJLFQH4 GIVA Crown Heart Anklet ₹2,379 (−34%, MRP ₹3,598) 4.0★ (2) IN STOCK #3,345 Women's Anklets; (2) B0BBW66SSM GIVA Zircon Constellation Earrings ₹1,019 (−43%, MRP ₹1,798) 4.3★ (112) 100+ bought/mo IN STOCK #753 Women's Earrings (fewer-returns badge); (3) B09DGKCSH8 GIVA Toe Rings ₹934 (−58%, MRP ₹2,199) 4.3★ (141) 200+ bought/mo IN STOCK #5 Women's Rings/#87 Jewellery (fewer-returns badge); (4) B09R25NXDF HIGHSPARK Solitaire Screwback Studs 5mm ₹768 (−49%, MRP ₹1,498, 5% coupon) 4.3★ (1,676) 50+ bought/mo IN STOCK #26 Women's Earrings; (5) B0BCC43YQ8 ZAVYA CZ Bali Hoops ₹1,306 (−42%, MRP ₹2,248, 2% coupon) 3.6★ (42) only 1 left IN STOCK variant #2,676 Women's Earrings; (6) B0CMTV7B49 GIVA Butterfly Rose-gold Studs ₹1,869 (−66%, MRP ₹5,499) 4.4★ (2) only 4 left (variant-listing title mismatch note). SCORES (0–100: afford 25/visual 20/content 20/audience 15/simplicity 10/conversion 10; ESTIMATE for visual/content/audience; VERIFIED for price/rating/stock/rank/velocity): B0BBW66SSM 88 → B09DGKCSH8 84 → B09R25NXDF 79 → B0BCC43YQ8 66 → B0CMTV7B49 64 → B08XJLFQH4 62. RECOMMENDED by evidence (velocity + rank + price + India cultural fit): B09DGKCSH8 GIVA Toe Rings; runner-up B0BBW66SSM. UNKNOWN: commission % ALL (no PA-API; Owner must confirm), stock longevity, price stability, exact click-through. NO production action taken. PASS
