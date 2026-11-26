#!/usr/bin/env sh
# Backs up the database (pg_dump) and uploaded images into ./backups.
# Needs the PostgreSQL client tools (pg_dump). Example cron (daily at 2:30):
#   30 2 * * * cd /opt/bquee && sh scripts/backup.sh >/dev/null 2>&1
set -e
cd "$(dirname "$0")/.."

# DATABASE_URL and UPLOADS_DIR from .env unless already set
if [ -f .env ]; then
  [ -n "$DATABASE_URL" ] || DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)
  [ -n "$UPLOADS_DIR" ] || UPLOADS_DIR=$(grep -E '^UPLOADS_DIR=' .env | cut -d= -f2-)
fi
: "${DATABASE_URL:?Set DATABASE_URL}"
UPLOADS_DIR="${UPLOADS_DIR:-storage/uploads}"
KEEP_DAYS="${KEEP_DAYS:-14}"

stamp=$(date +%Y%m%d-%H%M%S)
mkdir -p backups
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="backups/bquee-$stamp.dump"
[ -d "$UPLOADS_DIR" ] && tar -czf "backups/uploads-$stamp.tar.gz" -C "$UPLOADS_DIR" .

find backups -type f -mtime +"$KEEP_DAYS" -delete
echo "Backup written to backups/ (bquee-$stamp.dump)"
echo "Restore with: pg_restore --clean --no-owner --dbname=\"\$DATABASE_URL\" backups/bquee-$stamp.dump"
