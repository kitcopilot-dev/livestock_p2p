#!/usr/bin/env bash
# deploy.sh — Deploy Livestock P2P to an exe.dev VM
#
# Usage (on the VM):
#   bash deploy.sh
#
# Or trigger from GitHub Actions via SSH.
set -euo pipefail

APP_DIR="/home/exedev/livestock_p2p"
BRANCH="${BRANCH:-main}"
PORT="${PORT:-3000}"

echo "=== Livestock P2P deploy — branch: $BRANCH ==="

# ── 1. Clone or pull ──────────────────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  echo "→ Pulling latest from $BRANCH"
  cd "$APP_DIR"
  git fetch origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
else
  echo "→ Cloning repo"
  git clone --branch "$BRANCH" --depth 1 https://github.com/kitcopilot-dev/livestock_p2p.git "$APP_DIR"
  cd "$APP_DIR"
fi

# ── 2. Node + pnpm ────────────────────────────────────────────────────────
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
  nvm use 2>/dev/null || true
fi

if ! command -v pnpm &>/dev/null; then
  echo "→ Installing pnpm"
  npm install -g pnpm
fi

# ── 3. Dependencies ───────────────────────────────────────────────────────
echo "→ Installing dependencies"
pnpm install --frozen-lockfile

# ── 4. Environment ────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "⚠  No .env file found — copying from .env.example"
  cp .env.example .env 2>/dev/null || true
fi

# ── 5. Prisma migration ───────────────────────────────────────────────────
echo "→ Running Prisma migrations"
cd packages/db
pnpm prisma migrate deploy 2>/dev/null || pnpm prisma db push --force-reset 2>/dev/null || true
pnpm prisma generate 2>/dev/null || true
cd ../..

# ── 6. Build ──────────────────────────────────────────────────────────────
echo "→ Building Next.js app"
pnpm --filter @livestock/api build

# ── 7. Stop existing process ──────────────────────────────────────────────
echo "→ Stopping existing process on port $PORT"
fuser -k "$PORT/tcp" 2>/dev/null || true
sleep 1

# ── 8. Start ──────────────────────────────────────────────────────────────
echo "→ Starting app on port $PORT"
cd apps/api
nohup pnpm start -p "$PORT" -H 0.0.0.0 > /tmp/livestock-p2p.log 2>&1 &
echo $! > /tmp/livestock-p2p.pid
cd ../..

echo "✅ Deployed! PID: $(cat /tmp/livestock-p2p.pid)"
echo "   Log: /tmp/livestock-p2p.log"
echo "   URL: https://livestockp2p.exe.xyz"
