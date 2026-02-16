#!/usr/bin/env bash
# Deploy ForwardCheck-AI to Railway
#
# Railway CLI uploads the entire working directory including .git (80MB+),
# which causes upload timeouts. This script copies only the essential files
# to a temp directory (~1MB) and deploys from there.
#
# Prerequisites:
#   - Railway CLI installed: npm install -g @railway/cli
#   - Logged in: railway login
#   - Project linked: railway link (run once from project root)
#
# Usage:
#   ./scripts/deploy.sh           # Deploy with default message
#   ./scripts/deploy.sh "hotfix"  # Deploy with custom message

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_MSG="${1:-deploy from $(git branch --show-current 2>/dev/null || echo 'unknown')}"

# --- Preflight checks ---

if ! command -v railway &>/dev/null; then
  echo "Error: Railway CLI not found. Install with: npm install -g @railway/cli"
  exit 1
fi

if ! railway whoami &>/dev/null; then
  echo "Error: Not logged in. Run: railway login"
  exit 1
fi

if ! railway status &>/dev/null; then
  echo "Error: No project linked. Run: railway link"
  exit 1
fi

# --- Build temp deploy directory ---

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "Assembling deploy package..."

# Source code and templates
cp -r "$PROJECT_DIR/src" "$TMPDIR/"

# Static assets
if [ -d "$PROJECT_DIR/public" ]; then
  cp -r "$PROJECT_DIR/public" "$TMPDIR/"
fi

# Package files
cp "$PROJECT_DIR/package.json" "$TMPDIR/"
cp "$PROJECT_DIR/package-lock.json" "$TMPDIR/"
cp "$PROJECT_DIR/tsconfig.json" "$TMPDIR/"

# Docker build config
cp "$PROJECT_DIR/Dockerfile" "$TMPDIR/"
cp "$PROJECT_DIR/.dockerignore" "$TMPDIR/"
cp "$PROJECT_DIR/railway.toml" "$TMPDIR/"

# Files referenced by Dockerfile COPY directives
if [ -f "$PROJECT_DIR/TECHNICAL_BLOG.html" ]; then
  cp "$PROJECT_DIR/TECHNICAL_BLOG.html" "$TMPDIR/"
fi

SIZE=$(du -sh "$TMPDIR" | cut -f1)
echo "Deploy package: $SIZE (vs ~80MB full repo)"

# --- Link temp dir to Railway project ---

# Read project/service/env IDs from the linked project
PROJECT_ID=$(railway status 2>&1 | grep "Project:" | head -1 | sed 's/Project: //')
SERVICE_NAME=$(railway status 2>&1 | grep "Service:" | head -1 | sed 's/Service: //')

echo "Deploying to: $PROJECT_ID / $SERVICE_NAME"

# Copy Railway link config so temp dir knows which project to deploy to
if [ -d "$PROJECT_DIR/.railway" ]; then
  cp -r "$PROJECT_DIR/.railway" "$TMPDIR/"
fi

# --- Deploy ---

echo "Uploading to Railway..."
cd "$TMPDIR"
railway up -d -m "$DEPLOY_MSG" 2>&1

echo ""
echo "Deploy triggered. Waiting for build..."

# --- Wait for build ---

MAX_WAIT=300
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
  STATUS=$(railway service status 2>&1 | grep "Status:" | head -1 | sed 's/Status: //')
  case "$STATUS" in
    SUCCESS)
      echo "Build succeeded!"
      break
      ;;
    *FAIL*|*CRASH*|*ERROR*)
      echo "Build failed with status: $STATUS"
      echo "Check logs: railway service logs"
      exit 1
      ;;
    *)
      printf "\r  Status: %-20s (%ds)" "$STATUS" "$ELAPSED"
      sleep 10
      ELAPSED=$((ELAPSED + 10))
      ;;
  esac
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
  echo ""
  echo "Warning: Build did not complete within ${MAX_WAIT}s. Check: railway service status"
  exit 1
fi

# --- Verify ---

cd "$PROJECT_DIR"

# Get the domain from Railway
DOMAIN=$(railway domain 2>&1 | grep "https://" | head -1 | tr -d '[:space:]' | sed 's/.*https/https/')

if [ -n "$DOMAIN" ]; then
  echo ""
  echo "Verifying health..."
  sleep 5
  HEALTH=$(curl -sf "$DOMAIN/health" 2>/dev/null || echo '{"status":"unreachable"}')
  echo "Health: $HEALTH"
  echo ""
  echo "Live at: $DOMAIN"
else
  echo ""
  echo "No domain configured. Add one with: railway domain"
fi

echo "Deploy complete."
