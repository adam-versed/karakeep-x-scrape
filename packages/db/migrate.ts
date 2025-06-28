import { db } from "./drizzle";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import dbConfig from "./drizzle.config";
import path from "path";

console.log("🔄 Starting database migration...");
console.log("📁 Database URL:", dbConfig.dbCredentials.url);
console.log("📁 Migrations folder:", path.resolve("./drizzle"));

try {
  migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✅ Database migration completed successfully!");
} catch (error) {
  console.error("❌ Database migration failed:", error);
  process.exit(1);
}
