# n8n infrastructure

This directory is the reproducible source for the private development instance at
`https://n8n.nosova.me`.

## Pinned services

- n8n `2.26.8`
- PostgreSQL `16`
- `@apify/n8n-nodes-apify` `0.6.10`

The n8n port is bound to `127.0.0.1` and is exposed only through Caddy. Runtime
secrets live in `/data/n8n/.env` on the VPS and are never committed.

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
