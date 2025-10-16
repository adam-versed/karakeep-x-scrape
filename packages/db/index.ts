import type { ResultSet } from "@libsql/client";
import { ExtractTablesWithRelations } from "drizzle-orm";
import { SQLiteTransaction } from "drizzle-orm/sqlite-core";

import * as schema from "./schema";

export { db } from "./drizzle";
export type { DB } from "./drizzle";
export * as schema from "./schema";
export { LibsqlError as SqliteError } from "@libsql/client";
// Re-export selected Drizzle helpers to ensure a single type identity across packages
export { eq, and, or, asc, desc, sql, count } from "drizzle-orm";

// This is exported here to avoid leaking libsql types outside of this package.
export type KarakeepDBTransaction = SQLiteTransaction<
  "async",
  ResultSet,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
