import { db } from "./drizzle";
import { migrate } from "drizzle-orm/libsql/migrator";

migrate(db, { migrationsFolder: "./drizzle" });
