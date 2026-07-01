#!/bin/bash
# Curato - Deploy Script
# Usage: ./scripts/deploy.sh

set -euo pipefail

echo ""
echo "  Curato - Deploy"
echo "  =================="
echo ""

# Backup database first
echo "  1/6 Backing up database..."
./scripts/backup.sh

# Install dependencies
echo ""
echo "  2/6 Installing dependencies..."
npm install --production

# Run migrations
echo ""
echo "  3/6 Running migrations..."
npm run migrate

# Build server
echo ""
echo "  4/6 Building server..."
npm run build

# Build display app
echo ""
echo "  5/6 Building display app..."
cd ../display
npm install
npm run build
cd ../server

# Build admin UI
echo ""
echo "  6/6 Building admin UI..."
cd ../admin
npm install
npm run build
cd ../server

echo ""
echo "  Deploy complete!"
echo "  Restart the server: sudo systemctl restart curato"
echo ""
