# Backup & Restore Runbook (Phase-09: backups + real restore test)

**Status:** PROCEDURE + evidence. Local restore test executed; production backup
is an Owner procedure (Neon has automatic point-in-time backups).

## What is backed up
The PostgreSQL database `aios` (all migrations-applied schema + business data:
affiliate_links, affiliate_link_clicks, content_assets, opportunities,
opportunity_evidence, revenue_events, profit_records, boss_* tables).

Nothing else is stateful: env vars are in Render/Neon secret stores; code/docs
are in git.

## Backup (local)
```powershell
# Convenience wrapper (creates a timestamped logical dump)
npm run db:backup   # -> db/backups/aios-backup-<timestamp>.dump
```

Raw command:
```powershell
pg_dump -h localhost -U aios -d aios -Fc `
  -f "C:\Users\ADMIN\AppData\Local\Temp\opencode\aios-backup.dump"
```

## Restore test (local, scratch database)
```powershell
# restored into a throwaway DB, then verified counts == source, then dropped
npm run db:restore-test
```

Raw steps:
1. `createdb -h localhost -U aios aios_restore_test`
2. `pg_restore -h localhost -U aios -d aios_restore_test -Fc --clean aios-backup.dump`
3. For the known table set, `\dt` count and `SELECT COUNT(*)` spot checks must
   match the source database (evidence: table-count match + per-table row counts).
4. `dropdb -h localhost -U aios aios_restore_test`

## Production (Owner task — no credentials in the agent's hands)
- Neon (managed Postgres): automatic continuous backups + PITR are enabled per
  the Neon project. The Owner can restore via the Neon dashboard or by switching
  the Render `DATABASE_URL` secret to a restored branch.
- An application-level restore drill is only meaningful against a scratch DB;
  it never touches the live production DB.

## Evidence log
| Date | Backup taken | Restore test | Result |
|---|---|---|---|
| 2026-09-25 | local `aios` logical dump | scratch-db restore, table+row counts compared | PASS (see session change history) |

## Blast radius
Logical dumps + scratch-DB restore are read-only on source and disposable on
target — no risk to the live database.