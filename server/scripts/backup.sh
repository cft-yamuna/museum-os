#!/bin/bash
# Museum OS - Database Backup Script
# Usage: ./scripts/backup.sh
# Cron: 0 3 * * * /path/to/server/scripts/backup.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
DB_URL="${DATABASE_URL:-postgresql://lightman:lightman@localhost:5432/lightman}"
RETENTION_DAYS=30

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Generate filename with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/lightman_${TIMESTAMP}.sql.gz"

echo "[Backup] Starting database backup..."
echo "[Backup] Target: $BACKUP_FILE"

# Run pg_dump and compress
pg_dump "$DB_URL" | gzip > "$BACKUP_FILE"

# Get file size
SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
echo "[Backup] Complete: $BACKUP_FILE ($SIZE)"

# Clean up old backups
echo "[Backup] Removing backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "lightman_*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Count remaining backups
COUNT=$(find "$BACKUP_DIR" -name "lightman_*.sql.gz" | wc -l)
echo "[Backup] $COUNT backup(s) retained"
