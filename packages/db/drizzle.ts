import "dotenv/config";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "path";

import dbConfig from "./drizzle.config";

const client = createClient({
  url: dbConfig.dbCredentials.url.startsWith("file:")
    ? dbConfig.dbCredentials.url
    : `file:${dbConfig.dbCredentials.url}`,
});
export const db = drizzle(client, { schema });
export type DB = typeof db;

export function getInMemoryDB(runMigrations: boolean) {
  const memClient = createClient({
    url: ":memory:",
  });
  const db = drizzle(memClient, { schema, logger: false });
  if (runMigrations) {
    migrate(db, { migrationsFolder: path.resolve(__dirname, "./drizzle") });
  }
  return db;
}
