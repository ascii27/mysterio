#!/usr/bin/env bash
set -euo pipefail

VM_HOST="${MYSTERIO_VM_HOST:-panther-golem.exe.xyz}"
REMOTE_DIR="${MYSTERIO_REMOTE_DIR:-mysterio}"

echo "==> Local build"
pnpm --filter @mysterio/shared build
pnpm --filter @mysterio/server build
pnpm --filter @mysterio/web build

echo "==> Sync to ${VM_HOST}:~/${REMOTE_DIR}"
rsync -avz --delete \
  --exclude '.git' --exclude 'node_modules' --exclude 'data' --exclude '.env' \
  --exclude '*.tsbuildinfo' --exclude '.DS_Store' \
  ./ "${VM_HOST}:~/${REMOTE_DIR}/"

echo "==> Remote install + migrate + restart"
ssh "${VM_HOST}" bash -lc "'
  set -euo pipefail
  cd ~/${REMOTE_DIR}
  if [ ! -f .env ]; then
    echo \"ERROR: ~/${REMOTE_DIR}/.env missing on VM. scp it manually first.\" >&2
    exit 1
  fi
  corepack enable >/dev/null 2>&1 || true
  pnpm install --frozen-lockfile
  pnpm --filter @mysterio/server db:migrate
  pnpm --filter @mysterio/server db:seed || true
  pnpm --filter @mysterio/server db:seed:world || true
  pnpm --filter @mysterio/server db:backfill:images || true
  mkdir -p ~/.config/systemd/user
  cp apps/server/systemd/mysterio.service ~/.config/systemd/user/mysterio.service
  systemctl --user daemon-reload
  systemctl --user enable mysterio || true
  systemctl --user restart mysterio
  systemctl --user --no-pager --lines=20 status mysterio || true
'"

echo "==> Health check"
sleep 3
curl -fsS "https://${VM_HOST/.exe.xyz/}.exe.xyz/api/health" || {
  echo "Health check failed. Check 'ssh ${VM_HOST} journalctl --user -u mysterio -n 100' for logs."
  exit 1
}
echo
echo "OK — visit https://panther-golem.exe.xyz/"
