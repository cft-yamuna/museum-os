#!/bin/bash
# Curato - Database Restore Script
# Usage: ./scripts/restore.sh <backup_file>

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  echo ""
  echo "Available backups:"
  ls -lh ./backups/curato_*.sql.gz 2>/dev/null || echo "  No backups found"
  exit 1
fi

BACKUP_FILE="$1"
DB_URL="${DATABASE_URL:-postgresql://curato:curato@localhost:5432/curato}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "WARNING: This will replace the current database with the backup."
echo "Backup file: $BACKUP_FILE"
read -p "Continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

echo "[Restore] Dropping and recreating database..."
DB_NAME=$(echo "$DB_URL" | sed 's|.*/||')

# Restore
echo "[Restore] Restoring from $BACKUP_FILE..."
gunzip -c "$BACKUP_FILE" | psql "$DB_URL"

echo "[Restore] Complete!"
echo "[Restore] Run migrations to ensure schema is up to date:"
echo "  npm run migrate"
