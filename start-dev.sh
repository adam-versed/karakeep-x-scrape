#!/bin/bash

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if a port is in use
port_in_use() {
    lsof -i :"$1" >/dev/null 2>&1
}

# Check if Docker is installed
if ! command_exists docker; then
    echo "Error: Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if pnpm is installed
if ! command_exists pnpm; then
    echo "Error: pnpm is not installed. Please install pnpm first."
    exit 1
fi

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "Error: .env file not found. Please copy .env.sample to .env and configure it."
    exit 1
fi

# Check DATA_DIR is set and absolute
if [ -z "$DATA_DIR" ]; then
    echo "Error: DATA_DIR not set in .env file"
    exit 1
fi

# Check if DATA_DIR is an absolute path
if [[ "$DATA_DIR" != /* ]]; then
    echo "Error: DATA_DIR must be an absolute path in .env file"
    echo "Current value: $DATA_DIR"
    echo "Please change it to an absolute path like: $(pwd)/data"
    exit 1
fi

echo "Using DATA_DIR: $DATA_DIR"

# Create data directory if it doesn't exist
if [ ! -d "$DATA_DIR" ]; then
    echo "Creating data directory at $DATA_DIR..."
    mkdir -p "$DATA_DIR"
fi

# Check if database exists and has tables
DB_PATH="$DATA_DIR/db.db"
DB_EXISTS=false
DB_HAS_TABLES=false

if [ -f "$DB_PATH" ]; then
    DB_EXISTS=true
    # Check if database has the user table
    if command_exists sqlite3; then
        TABLE_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='user';" 2>/dev/null || echo "0")
        if [ "$TABLE_COUNT" = "1" ]; then
            DB_HAS_TABLES=true
            echo "Database found at $DB_PATH with user table"
        else
            echo "Database found at $DB_PATH but missing user table"
        fi
    else
        # If sqlite3 not available, check file size as a proxy
        DB_SIZE=$(stat -f%z "$DB_PATH" 2>/dev/null || stat -c%s "$DB_PATH" 2>/dev/null || echo "0")
        if [ "$DB_SIZE" -gt 1000 ]; then
            DB_HAS_TABLES=true
            echo "Database found at $DB_PATH (size: $DB_SIZE bytes)"
        else
            echo "Database found at $DB_PATH but appears to be empty"
        fi
    fi
else
    echo "No database found at $DB_PATH"
fi

# Run migrations if database doesn't exist or doesn't have tables
if [ "$DB_EXISTS" = false ] || [ "$DB_HAS_TABLES" = false ]; then
    echo "Running database migrations..."
    # Export DATA_DIR so it's available to the migration process
    export DATA_DIR
    # Run migration from root directory to ensure correct path resolution
    pnpm run db:migrate
    
    # Verify migration succeeded
    if [ -f "$DB_PATH" ]; then
        DB_SIZE=$(stat -f%z "$DB_PATH" 2>/dev/null || stat -c%s "$DB_PATH" 2>/dev/null || echo "0")
        if [ "$DB_SIZE" -gt 1000 ]; then
            echo "✓ Database migrations completed successfully"
        else
            echo "⚠️  Warning: Database created but appears to be empty. You may encounter issues."
        fi
    else
        echo "❌ Error: Database migration failed - no database file created"
        exit 1
    fi
else
    echo "✓ Database already initialized"
fi

# Start Meilisearch if not already running
if ! port_in_use 7700; then
    echo "Starting Meilisearch..."
    docker run -d -p 7700:7700 --name karakeep-meilisearch getmeili/meilisearch:v1.13.3
else
    echo "Meilisearch is already running on port 7700"
fi

# Start Chrome if not already running
if ! port_in_use 9222; then
    echo "Starting headless Chrome..."
    docker run -d -p 9222:9222 --name karakeep-chrome gcr.io/zenika-hub/alpine-chrome:123 \
        --no-sandbox \
        --disable-gpu \
        --disable-dev-shm-usage \
        --remote-debugging-address=0.0.0.0 \
        --remote-debugging-port=9222 \
        --hide-scrollbars
else
    echo "Chrome is already running on port 9222"
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    pnpm install
fi

# Start the web app and workers in parallel
echo "Starting web app and workers..."
pnpm web & WEB_PID=$!
pnpm workers & WORKERS_PID=$!

# Function to handle script termination
cleanup() {
    echo "Shutting down services..."
    kill $WEB_PID $WORKERS_PID 2>/dev/null
    docker stop karakeep-meilisearch karakeep-chrome 2>/dev/null
    docker rm karakeep-meilisearch karakeep-chrome 2>/dev/null
    exit 0
}

# Set up trap to catch termination signals
trap cleanup SIGINT SIGTERM

echo "Development environment is running!"
echo "Web app: http://localhost:3000"
echo "Meilisearch: http://localhost:7700"
echo "Chrome debugger: http://localhost:9222"
echo "Press Ctrl+C to stop all services"

# Wait for user interrupt
wait 
