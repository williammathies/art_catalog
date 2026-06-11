#!/usr/bin/env bash
# Runs on the OptiPlex self-hosted runner after tests pass on main.
set -euo pipefail

APP_DIR="/home/williammathies/apps/art-catalog"
cd "$APP_DIR"

git pull --rebase origin main
npm ci --omit=dev
pm2 restart art-catalog || pm2 start ecosystem.config.js
pm2 save
