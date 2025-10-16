import path from "path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { vi } from "vitest";

import { getInMemoryDB } from "@karakeep/db/drizzle";
import { users } from "@karakeep/db/schema";

import { createCallerFactory } from "./index";
import { appRouter } from "./routers/_app";

export async function getTestDB() {
  const db = await getInMemoryDB(false);
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../db/drizzle"),
  });
  const tables = await db.run(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name ASC",
  );
  const tableCount = Array.isArray(tables?.rows) ? tables.rows.length : 0;
  console.info(
    "[trpc-tests] In-memory DB ready with migrations applied; table count:",
    tableCount,
  );
  return db;
}

export type TestDB = Awaited<ReturnType<typeof getTestDB>>;

export async function seedUsers(db: TestDB) {
  return await db
    .insert(users)
    .values([
      {
        name: "Test User 1",
        email: "test1@test.com",
      },
      {
        name: "Test User 2",
        email: "test2@test.com",
      },
    ])
    .returning();
}

export function getApiCaller(db: TestDB, userId?: string, email?: string) {
  const createCaller = createCallerFactory(appRouter);
  return createCaller({
    user: userId
      ? {
          id: userId,
          email,
          role: "user",
        }
      : null,
    db,
    req: {
      ip: null,
    },
  });
}

export type APICallerType = ReturnType<typeof getApiCaller>;

export interface CustomTestContext {
  apiCallers: APICallerType[];
  unauthedAPICaller: APICallerType;
  db: TestDB;
}

export async function buildTestContext(
  seedDB: boolean,
): Promise<CustomTestContext> {
  console.info("[trpc-tests] buildTestContext invoked", { seedDB });
  const db = await getTestDB();
  await db.run("PRAGMA foreign_keys = ON");
  let users: Awaited<ReturnType<typeof seedUsers>> = [];
  if (seedDB) {
    console.info("[trpc-tests] Seeding default users");
    users = await seedUsers(db);
    console.info("[trpc-tests] Seeded", users.length, "users");
  }
  const callers = users.map((u) => getApiCaller(db, u.id, u.email));

  return {
    apiCallers: callers,
    unauthedAPICaller: getApiCaller(db),
    db,
  };
}

export function defaultBeforeEach(seedDB = true) {
  return async (context: object) => {
    vi.mock("@karakeep/shared/queues", () => ({
      LinkCrawlerQueue: {
        enqueue: vi.fn(),
      },
      InferenceQueue: {
        enqueue: vi.fn(),
      },
      // Legacy export for backward compatibility
      OpenAIQueue: {
        enqueue: vi.fn(),
      },
      triggerRuleEngineOnEvent: vi.fn(),
      triggerSearchReindex: vi.fn(),
      triggerWebhook: vi.fn(),
      triggerSearchDeletion: vi.fn(),
    }));
    Object.assign(context, await buildTestContext(seedDB));
  };
}
