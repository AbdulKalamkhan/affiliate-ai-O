// db-restore-test.mjs — Phase-09 restore DRILL into a disposable scratch
// database. Dumps the live local `aios`, restores into aios_restore_test,
// compares table membership + per-table row counts, then drops the scratch DB.
// Read-only against the source; the scratch DB is destroyed afterwards.
// Usage: npm run db:restore-test

import { execFileSync } from "node:child_process";
import { mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = "aios_restore_test";
const tmpDir = join(root, "db", "backups");
mkdirSync(tmpDir, { recursive: true });
const dump = join(tmpDir, "restore-test.dump");

const dbUrl = new URL(process.env.DATABASE_URL ?? "postgresql://aios@localhost:5432/aios");
let host = dbUrl.hostname ?? "localhost";
if (host === "localhost" || host === "::1" || host === "[::1]") host = "127.0.0.1";
const port = dbUrl.port || "5432";
const user = decodeURIComponent(dbUrl.username) || "aios";
const database = dbUrl.pathname.replace(/^\//, "").split("?")[0] || "aios";
if (dbUrl.password) process.env.PGPASSWORD = decodeURIComponent(dbUrl.password);

const pg = (...args) => execFileSync(...args, { stdio: "pipe", encoding: "utf8" });

const tableNames = (databaseName) =>
  pg(
    "psql",
    ["-h", host, "-p", port, "-U", user, "-d", databaseName, "-t", "-A", "-c", "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"],
  )
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

try {
  pg("pg_dump", ["-h", host, "-p", port, "-U", user, "-d", database, "-Fc", "-f", dump]);
  console.log("1/4 logical dump of", database, "OK");

  try {
    pg("dropdb", ["-h", host, "-p", port, "-U", user, "--if-exists", scratch]);
    pg("createdb", ["-h", host, "-p", port, "-U", user, scratch]);
    pg("pg_restore", ["-h", host, "-p", port, "-U", user, "-d", scratch, "-Fc", "--clean", "--no-owner", dump]);
    console.log("2/4 restore into scratch DB", scratch, "OK");
  } catch (err) {
    console.error("Restore step failed:", err.message);
    process.exitCode = 1;
  }

  const sourceTables = tableNames(database).sort();
  const scratchTables = tableNames(scratch).sort();

  const missing = sourceTables.filter((t) => !scratchTables.includes(t));
  const rowCheck = [];
  for (const table of sourceTables) {
    const a = Number(
      pg("psql", ["-h", host, "-p", port, "-U", user, "-d", database, "-t", "-A", "-c", `SELECT count(*) FROM ${table}`]).trim(),
    );
    const b = Number(
      pg("psql", ["-h", host, "-p", port, "-U", user, "-d", scratch, "-t", "-A", "-c", `SELECT count(*) FROM ${table}`]).trim(),
    );
    rowCheck.push({ table, source: a, restored: b, match: String(a) === String(b) });
  }

  const tablesMatch = missing.length === 0;
  const rowsMatch = rowCheck.every((r) => r.match);
  console.log(`3/4 comparison: tables source=${sourceTables.length} restored=${scratchTables.length} missing=${missing.length || "none"}; every row count matches = ${rowsMatch}`);

  try {
    pg("dropdb", ["-h", host, "-p", port, "-U", user, scratch]);
    console.log("4/4 scratch DB dropped");
  } catch (err) {
    console.error("Scratch DB drop failed (left for inspection):", err.message);
  }

  unlinkSync(dump);
  const ok = tablesMatch && rowsMatch;
  console.log(ok ? "RESTORE TEST PASS" : "RESTORE TEST FAIL");
  if (!ok) process.exitCode = 1;
} catch (err) {
  console.error("Backup/restore test failed:", err.message);
  console.error("Is PostgreSQL running and are pg tools on PATH?");
  process.exitCode = 1;
}