import path from "node:path";

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

// Cached on globalThis so Next.js HMR doesn't open a new connection (or
// re-run migrations) on every reload.
const globalForDb = globalThis as unknown as { __sonicDb?: Promise<Db> };

async function createDb(): Promise<Db> {
  const migrationsFolder = path.join(process.cwd(), "drizzle");

  if (process.env.DATABASE_URL) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const postgres = (await import("postgres")).default;
    const client = postgres(process.env.DATABASE_URL, { max: 5 });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
    return db;
  }

  // No DATABASE_URL: embedded Postgres (PGlite) persisted to .pglite/ —
  // zero-setup local dev, same SQL dialect as production.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(path.join(process.cwd(), ".pglite"));
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return db;
}

export function getDb(): Promise<Db> {
  if (!globalForDb.__sonicDb) {
    const pending = createDb();
    globalForDb.__sonicDb = pending;
    // Don't cache a failed init — a transient error (locked data dir, DB
    // briefly unreachable) would otherwise poison every later request.
    pending.catch(() => {
      if (globalForDb.__sonicDb === pending) {
        globalForDb.__sonicDb = undefined;
      }
    });
  }
  return globalForDb.__sonicDb;
}
