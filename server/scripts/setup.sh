#!/bin/bash
# Curato - First-time Setup Script
# Usage: ./scripts/setup.sh

set -euo pipefail

echo ""
echo "  Curato - First-time Setup"
echo "  ============================"
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is required"; exit 1; }
command -v psql >/dev/null 2>&1 || { echo "Error: PostgreSQL client is required"; exit 1; }

NODE_VERSION=$(node -v | sed 's/v//')
echo "  Node.js:    v$NODE_VERSION"

# Check .env file
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    echo "  Creating .env from .env.example..."
    cp .env.example .env
    echo "  IMPORTANT: Edit .env with your settings before continuing!"
    echo ""
    read -p "  Press Enter after editing .env..."
  else
    echo "Error: No .env file found. Create one from .env.example"
    exit 1
  fi
fi

# Install dependencies
echo ""
echo "  Installing dependencies..."
npm install

# Run database migrations
echo ""
echo "  Running database migrations..."
npm run migrate

# Run seed data
echo ""
echo "  Seeding initial data..."
npm run seed

# Build TypeScript
echo ""
echo "  Building TypeScript..."
npm run build

# Create storage directory
mkdir -p ./storage
echo "  Storage directory: ./storage"

# Create backups directory
mkdir -p ./backups
echo "  Backups directory: ./backups"

echo ""
echo "  Setup complete!"
echo "  ==============="
echo ""
echo "  Default admin credentials:"
echo "    Email:    admin@curato.local"
echo "    Password: admin123"
echo ""
echo "  Start the server:"
echo "    npm run dev    (development)"
echo "    npm start      (production)"
echo ""
