import { ExtractTablesWithRelations } from "drizzle-orm";
import { SQLiteTransaction } from "drizzle-orm/sqlite-core";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import type { ResultSet } from "@libsql/client";

import * as schema from "./schema";

export { db } from "./drizzle";
export type { DB } from "./drizzle";
export * as schema from "./schema";
export { LibsqlError as SqliteError } from "@libsql/client";

// This is exported here to avoid leaking libsql types outside of this package.
export type KarakeepDBTransaction = SQLiteTransaction<
  "async",
  ResultSet,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
