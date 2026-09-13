// Unit tests never touch the real database (fakes are injected), but the
// @ai-os/database package instantiates PrismaClient at import time, which
// requires DATABASE_URL to resolve. This fixture prevents construction errors.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://aios:unused@localhost:5432/aios?schema=public";