# CLAUDE.md - Project Documentation

## libSQL Migration (July 2025)

### Background
The Karakeep project was experiencing transaction errors after forking and upgrading to Node.js v22. The issue manifested as:
- "Transaction function cannot return a promise" errors during signin
- Failed database operations with async transactions
- Incompatibility between Drizzle ORM's better-sqlite3 adapter and async functions

### Root Cause
The better-sqlite3 driver requires synchronous transactions, but the codebase extensively uses async/await patterns within database transactions. This is a fundamental incompatibility that affects all async transaction operations.

### Solution: Migration to @libsql/client

We migrated from better-sqlite3 to @libsql/client, which natively supports async transactions.

#### Key Changes Made:

1. **Dependencies** (`packages/db/package.json`):
   ```diff
   - "better-sqlite3": "^11.3.0",
   - "@types/better-sqlite3": "^7.6.11",
   + "@libsql/client": "^0.14.0",
   ```

2. **Database Connection** (`packages/db/drizzle.ts`):
   - Updated imports to use `drizzle-orm/libsql`
   - Changed database connection to use `createClient` from @libsql/client
   - Updated migrator import path

3. **API Compatibility**:
   - Replaced `.changes` with `.rowsAffected` across 10 files
   - Updated transaction type definitions
   - Fixed migration script imports

4. **Development Script** (`start-dev.sh`):
   - Removed dependency on sqlite3 CLI for table verification
   - Updated to use file size checks for database initialization

### Benefits:
- ✅ No more "Transaction function cannot return a promise" errors
- ✅ Full async/await support in transactions
- ✅ Minimal code changes (only database layer affected)
- ✅ Backward compatible with existing SQLite databases
- ✅ Better performance with async operations

### Testing Notes:
- Existing SQLite databases created with better-sqlite3 remain fully compatible
- All transaction-based operations (signin, signup, bookmark creation) work correctly
- The migration has been tested with both new and existing databases

### Future Considerations:
- libSQL is actively maintained and offers additional features like remote databases
- The migration positions the project for potential future enhancements
- Consider documenting this change in the main Karakeep documentation for other developers

## Additional Project Notes

### X.com Scraping Feature
A separate feature branch (`feat/drizzle-with-x-scrape`) contains X.com scraping functionality that was developed alongside the transaction fixes. This feature is ready for future integration once the libSQL migration is stable.

### Development Environment
- Node.js v22 is required
- The project uses pnpm for package management
- Docker containers are used for Meilisearch and headless Chrome services

## Development Workflow

### Commit Checks
- Ensure after each task is completed to run the following checks before attempting to commit:
  - `pnpm typecheck`
  - `pnpm format --check`
  - `pnpm lint`
  - `pnpm exec sherif`