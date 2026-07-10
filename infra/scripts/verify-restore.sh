#!/usr/bin/env bash
set -euo pipefail

root=/data/n8n
restore_db=n8n_restore_verification
dump_file=${1:-$(find "$root/backups/daily" -type f -name 'postgres-*.dump' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)}

if [[ -z "$dump_file" || ! -f "$dump_file" ]]; then
  echo "No PostgreSQL backup found" >&2
  exit 1
fi

set -a
source "$root/.env"
set +a

cleanup() {
  docker compose --env-file "$root/.env" -f "$root/compose.yaml" exec -T postgres \
    dropdb --if-exists --force --username "$POSTGRES_USER" "$restore_db" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
docker compose --env-file "$root/.env" -f "$root/compose.yaml" exec -T postgres \
  createdb --username "$POSTGRES_USER" "$restore_db"
docker compose --env-file "$root/.env" -f "$root/compose.yaml" exec -T postgres \
  pg_restore --no-owner --no-acl --username "$POSTGRES_USER" --dbname "$restore_db" < "$dump_file"

table_count=$(docker compose --env-file "$root/.env" -f "$root/compose.yaml" exec -T postgres \
  psql --tuples-only --no-align --username "$POSTGRES_USER" --dbname "$restore_db" \
  --command "select count(*) from information_schema.tables where table_schema = 'public';")

if [[ "$table_count" -lt 1 ]]; then
  echo "Restore verification found no application tables" >&2
  exit 1
fi

echo "Restore verification passed ($table_count public tables)"

