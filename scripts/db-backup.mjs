// db-backup.mjs — Phase-09 logical backup of the local `aios` database.
// Usage: npm run db:backup
// Produces a timestamped custom-format dump in db/backups/. Content only:
// no secrets, no env values. Never touches production.

import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "db", "backups");
mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outFile = join(outDir, `aios-backup-${stamp}.dump`);

const dbUrl = new URL(process.env.DATABASE_URL ?? "postgresql://aios@localhost:5432/aios");
let host = dbUrl.hostname ?? "localhost";
if (host === "localhost" || host === "::1" || host === "[::1]") host = "127.0.0.1";
const port = dbUrl.port || "5432";
const user = decodeURIComponent(dbUrl.username) || "aios";
const database = dbUrl.pathname.replace(/^\//, "").split("?")[0] || "aios";
if (dbUrl.password) process.env.PGPASSWORD = decodeURIComponent(dbUrl.password);

try {
  execFileSync("pg_dump", ["-h", host, "-p", port, "-U", user, "-d", database, "-Fc", "-f", outFile], {
    stdio: "inherit",
  });
  console.log(`Backup written: ${outFile}`);
} catch (err) {
  console.error("Backup failed:", err.message);
  console.error("Is PostgreSQL running and is pg_dump on PATH?");
  process.exitCode = 1;
}

if (!existsSync(outFile)) {
  console.error("No dump file produced.");
  process.exitCode = 1;
}