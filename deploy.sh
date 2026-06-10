#!/bin/bash
# deploy.sh - Run this on the OptiPlex after pushing to GitHub
set -e

APP_DIR="/home/williammathies/apps/art-catalog"
cd "$APP_DIR"

echo "📦 Pulling latest from GitHub..."
git pull origin main

echo "📚 Installing dependencies..."
npm install --production

echo "🔄 Restarting art-catalog..."
pm2 restart art-catalog || pm2 start ecosystem.config.js

echo "✅ Deployed successfully"
pm2 status
