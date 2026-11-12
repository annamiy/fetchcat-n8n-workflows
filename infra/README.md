# n8n infrastructure

This directory is the reproducible source for the private development instance at
`https://n8n.nosova.me`.

## Pinned services

- n8n `2.47.4` (upgraded from 2.26.8 on 12 Nov 2026)
- PostgreSQL `17` (moved from 16 by dump and restore on 12 Nov 2026)
- `@apify/n8n-nodes-apify` `0.9.0`

The n8n port is bound to `127.0.0.1` and is exposed only through Caddy. Caddy
asks for a basic-auth login on the editor, UI and internal REST paths; webhooks,
forms, `/healthz` and the API-key-protected `/api/v1` stay reachable. The
committed Caddy file carries a placeholder hash (`caddy hash-password`). Runtime
secrets live in `/data/n8n/.env` on the VPS and are never committed.

A PostgreSQL major upgrade is a dump and restore: stop n8n, `pg_dump
--format=custom` from the old container, move the data directory aside, start the
new image on an empty directory, `pg_restore --no-owner --no-acl`, compare row
counts, then start n8n.

## Operations

Since 12 Nov 2026 the agent user `hanna` has no Docker access to these containers.
Compose changes, `verify-restore.sh` and upgrades run as root (`sudo -i` over
Tailscale); the backup timer runs as `hanna` and dumps PostgreSQL through
`sudo -n /usr/local/sbin/fetchcat-n8n-cli pg-dump`.

```bash
# as root
cd /data/n8n
docker compose --env-file .env up -d
docker compose --env-file .env ps
./scripts/verify-restore.sh
# as hanna (or the backup timer)
./scripts/backup.sh
```

The backup timer retains seven daily and four weekly PostgreSQL/state backup
pairs under `/data/n8n/backups`.
