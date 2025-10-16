import "dotenv/config";

import os from "os";
import path from "path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import dbConfig from "./drizzle.config";
import * as schema from "./schema";

const client = createClient({
  url: dbConfig.dbCredentials.url.startsWith("file:")
    ? dbConfig.dbCredentials.url
    : `file:${dbConfig.dbCredentials.url}`,
});
export const db = drizzle(client, { schema });
export type DB = typeof db;

export async function getInMemoryDB(runMigrations: boolean) {
  const tmpPath = path.join(
    os.tmpdir(),
    `karakeep-test-${process.pid}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.db`,
  );
  const memClient = createClient({
    url: `file:${tmpPath}`,
  });
  const db = drizzle(memClient, { schema, logger: false });
  if (runMigrations) {
    await migrate(db, {
      migrationsFolder: path.resolve(__dirname, "./drizzle"),
    });
  }
  return db;
}
