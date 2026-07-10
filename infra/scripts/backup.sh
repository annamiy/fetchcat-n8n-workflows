#!/usr/bin/env bash
set -euo pipefail
umask 077

root=/data/n8n
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
daily_dir="$root/backups/daily"
weekly_dir="$root/backups/weekly"

set -a
source "$root/.env"
set +a

mkdir -p "$daily_dir" "$weekly_dir"
chmod 700 "$root/backups" "$daily_dir" "$weekly_dir"

docker compose --env-file "$root/.env" -f "$root/compose.yaml" exec -T postgres \
  pg_dump --format=custom --no-owner --no-acl --username "$POSTGRES_USER" "$POSTGRES_DB" \
  > "$daily_dir/postgres-$timestamp.dump"

tar \
  --exclude='state/.n8n-event-log*' \
  --exclude='state/nodes/node_modules' \
  -C "$root" \
  -czf "$daily_dir/state-$timestamp.tar.gz" \
  state

if [[ $(date -u +%u) == 7 ]]; then
  cp "$daily_dir/postgres-$timestamp.dump" "$weekly_dir/postgres-$timestamp.dump"
  cp "$daily_dir/state-$timestamp.tar.gz" "$weekly_dir/state-$timestamp.tar.gz"
fi

find "$daily_dir" -type f -name 'postgres-*.dump' -printf '%T@ %p\n' \
  | sort -nr | tail -n +8 | cut -d' ' -f2- | xargs -r rm -f
find "$daily_dir" -type f -name 'state-*.tar.gz' -printf '%T@ %p\n' \
  | sort -nr | tail -n +8 | cut -d' ' -f2- | xargs -r rm -f
find "$weekly_dir" -type f -name 'postgres-*.dump' -printf '%T@ %p\n' \
  | sort -nr | tail -n +5 | cut -d' ' -f2- | xargs -r rm -f
find "$weekly_dir" -type f -name 'state-*.tar.gz' -printf '%T@ %p\n' \
  | sort -nr | tail -n +5 | cut -d' ' -f2- | xargs -r rm -f
