# Runbook: SQLite → Postgres production cutover (Spec 3b-ii)

Prereqs: 3b-ii merged to `main`; the local **dry-run (Task 5) is green**. VM = `panther-golem.exe.xyz`
(Ubuntu 24.04, passwordless sudo). Live SQLite = `~/mysterio/data/mysterio.db`. No active users.

## A. Provision Postgres (one-time)
```bash
ssh panther-golem.exe.xyz
sudo apt-get update && sudo apt-get install -y postgresql      # PG 16, postgresql.service enabled
PW="$(openssl rand -hex 16)"                                    # generated; do NOT commit
sudo -u postgres psql -c "CREATE ROLE mysterio LOGIN PASSWORD '$PW';"
sudo -u postgres createdb -O mysterio mysterio
psql "postgresql://mysterio:$PW@localhost:5432/mysterio" -c "SELECT 1;"   # connectivity check
# Append DATABASE_URL to the server env (keep existing keys):
printf '\nDATABASE_URL=postgresql://mysterio:%s@localhost:5432/mysterio\n' "$PW" >> ~/mysterio/apps/server/.env
```

## B. Sync code (NOT deploy.sh's migrate/seed/restart tail)
From your laptop:
```bash
pnpm --filter @mysterio/shared build && pnpm --filter @mysterio/server build && pnpm --filter @mysterio/web build
rsync -avz --delete --exclude '.git' --exclude 'node_modules' --exclude 'data' --exclude '.env' \
  --exclude '*.tsbuildinfo' --exclude '.DS_Store' ./ panther-golem.exe.xyz:~/mysterio/
ssh panther-golem.exe.xyz 'cd ~/mysterio && pnpm install --frozen-lockfile && pnpm --filter @mysterio/server build'
```

## C. Cutover (maintenance window — app down)
```bash
ssh panther-golem.exe.xyz
cd ~/mysterio
systemctl --user stop mysterio                                  # window begins
# The live DB runs in WAL mode. Fold the (possibly large) -wal file into the
# main DB so BOTH the backup and the ETL read a complete, consistent snapshot.
# Harmless no-op if the clean shutdown already checkpointed. (sqlite3 CLI is on the VM.)
sqlite3 data/mysterio.db "PRAGMA wal_checkpoint(TRUNCATE);"
cp data/mysterio.db data/mysterio.db.bak-$(date +%Y%m%d-%H%M%S) # backup (now complete; ETL never mutates SQLite)
pnpm --filter @mysterio/server db:migrate                       # create empty PG schema
pnpm --filter @mysterio/server db:etl -- --sqlite ~/mysterio/data/mysterio.db   # load data; prints parity report
# (db:seed deliberately SKIPPED — real players come from the ETL)
systemctl --user start mysterio                                 # window ends — now on Postgres
```

## D. Validate
```bash
# on the VM:
psql "$DATABASE_URL" -c "SELECT 'players',count(*) FROM players UNION ALL SELECT 'mysteries',count(*) FROM mysteries UNION ALL SELECT 'clues',count(*) FROM clues UNION ALL SELECT 'solutions',count(*) FROM solutions UNION ALL SELECT 'hints',count(*) FROM hints;"
# expect 6 / 24 / 1 / 1 / 0
pg_dump "$DATABASE_URL" > ~/mysterio/data/pg-postcutover-$(date +%Y%m%d-%H%M%S).sql   # snapshot
```
From your laptop: `curl -fsS https://panther-golem.exe.xyz/api/health` → `{"ok":true,"db":true}`;
`curl -fsS https://panther-golem.exe.xyz/api/players` → 6 players with `reputation`. Then the iPad pass
(mystery list shows 21 ready; the one solved case's trophy renders).

## E. Rollback (if validation fails)
The SQLite DB is untouched (ETL only reads it). Redeploy the pre-3b-i SQLite build:
```bash
# The VM ~/mysterio is an rsync deploy (scripts/deploy.sh), NOT a git checkout —
# so roll back by redeploying the pre-3b-i (SQLite) build from your LAPTOP:
git checkout 6f0ff19          # laptop: last pre-3b-i (SQLite) commit on main
scripts/deploy.sh             # rsync + install + build + restart the VM service
git checkout -                # laptop: return to your previous branch
```
The VM `.env` still has `DATABASE_PATH=../../data/mysterio.db` (step A only APPENDED `DATABASE_URL`), so the
pre-3b-i code reads SQLite again. Then investigate the ETL failure offline against the `.bak` copy.
