# n8n infrastructure

This directory is the reproducible source for the private development instance at
`https://n8n.nosova.me`.

## Pinned services

- n8n `2.47.4` (upgraded from 2.26.8 on 12 Nov 2026)
- PostgreSQL `16`
- `@apify/n8n-nodes-apify` `0.9.0`

The n8n port is bound to `127.0.0.1` and is exposed only through Caddy. Caddy
asks for a basic-auth login on the editor, UI and internal REST paths; webhooks,
forms, `/healthz` and the API-key-protected `/api/v1` stay reachable. The
committed Caddy file carries a placeholder hash (`caddy hash-password`). Runtime
secrets live in `/data/n8n/.env` on the VPS and are never committed.

PostgreSQL 16 still works but n8n 2.47 reports it as outside the supported
range; moving to 17 needs a dump and restore and is a separate step.

## Operations

```bash
cd /data/n8n
docker compose --env-file .env up -d
docker compose --env-file .env ps
./scripts/backup.sh
./scripts/verify-restore.sh
```

The backup timer retains seven daily and four weekly PostgreSQL/state backup
pairs under `/data/n8n/backups`.
