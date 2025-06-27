# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Karakeep is a self-hostable bookmark management application with AI-powered features. It uses a monorepo architecture with Turborepo and pnpm workspaces, supporting web, mobile, browser extensions, and CLI applications.

## Essential Commands

### Development
```bash
pnpm dev                     # Start all apps in development
pnpm web                     # Start web app only  
pnpm workers                 # Start workers only
./start-dev.sh              # Automated dev environment with Docker services
```

### Testing & Quality
```bash
pnpm test                   # Run tests across all packages
pnpm typecheck              # TypeScript type checking
pnpm lint                   # Run oxlint across all packages
pnpm format                 # Check code formatting with Prettier
pnpm lint:fix               # Auto-fix linting issues
pnpm format:fix             # Auto-fix formatting issues
```

### Database
```bash
pnpm db:generate            # Generate database schema from Drizzle definitions
pnpm db:migrate             # Run database migrations
pnpm db:studio              # Open Drizzle Studio for database inspection
```

### Build & Deployment
```bash
pnpm build                  # Build all apps and packages
pnpm clean                  # Clean build artifacts
pnpm clean:workspaces       # Clean all workspace build artifacts
```

## Architecture Overview

### Core Technology Stack
- **Frontend**: Next.js 14 with App Router, React 18, Tailwind CSS + shadcn/ui
- **Backend**: tRPC for type-safe APIs, Drizzle ORM with SQLite
- **Search**: Meilisearch for full-text search
- **AI**: OpenAI API with Ollama support for local models
- **Authentication**: NextAuth.js
- **Scraping**: Playwright for web content extraction
- **Package Management**: pnpm with Turborepo

### Monorepo Structure
- **`/apps/`** - Applications (web, mobile, browser-extension, cli, workers, etc.)
- **`/packages/`** - Shared libraries (api, db, trpc, shared, shared-react, etc.)
- **`/tooling/`** - Development tools and configurations
- **`/docker/`** - Docker configurations and compose files

### Key Application Modules
- **`apps/web/`** - Main Next.js web application
- **`apps/workers/`** - Background job processing system
- **`apps/mobile/`** - React Native/Expo mobile app
- **`apps/browser-extension/`** - Chrome/Firefox extensions
- **`packages/db/`** - Database schema and migrations
- **`packages/trpc/`** - API router definitions
- **`packages/shared/`** - Business logic and utilities

## Development Workflow

### Environment Setup
1. Copy `.env.sample` to `.env` and configure required variables
2. Install dependencies: `pnpm install`
3. Run database migrations: `pnpm db:migrate`
4. Start development servers: `./start-dev.sh` or `pnpm dev`

### Required External Services
- **Meilisearch**: For search functionality (auto-started with Docker compose)
- **Chrome/Chromium**: For web scraping (installed in Docker containers)

### Testing Guidelines
- Unit tests use Vitest and are located alongside source files
- E2E tests are in `/packages/e2e_tests/`
- Run package-specific tests: `pnpm --filter @karakeep/package-name test`
- All tests must pass before considering tasks complete

### Code Quality Standards
- **Linting**: Uses oxlint for fast JavaScript/TypeScript linting
- **Formatting**: Prettier with shared configuration
- **Type Safety**: Strict TypeScript with full-stack type safety via tRPC
- **Database**: Code-first schema approach with Drizzle ORM

## Key Architectural Patterns

### Database Layer
- SQLite with Drizzle ORM for schema management
- Migrations in `packages/db/migrations/`
- Database utilities and queries in `packages/db/`

### API Layer
- tRPC routers provide type-safe client-server communication
- REST API routes in `packages/api/` for external integrations
- OpenAPI specification in `packages/open-api/`

### Background Processing
- Custom worker system in `apps/workers/`
- SQLite-based job queue for background tasks
- Handles content scraping, AI processing, and archival

### Content Processing Pipeline
- Web scraping with Playwright
- Full-page archival using Monolith
- OCR processing for images
- Video processing with yt-dlp
- AI-powered tagging and summarization

### Multi-Platform Support
- Shared business logic in `packages/shared/`
- React components in `packages/shared-react/`
- Platform-specific implementations in respective app directories

## Important Development Notes

- Use `pnpm` for package management (required for workspace functionality)
- Database changes require running `pnpm db:generate` after schema modifications
- The workers system handles all background processing and must be running for full functionality
- AI features require either OpenAI API keys or local Ollama setup
- Content archival features require Chrome/Chromium browser availability