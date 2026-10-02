#!/usr/bin/env bash
# Start the app and its Cloudflare tunnel, then point the app's links at the tunnel's address.
#   scripts/tunnel-up.sh
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"

docker compose up -d --build app tunnel
url=""
for _ in $(seq 1 30); do
  # The newest address in the log: the tunnel prints a new one each time it starts.
  url="$(docker compose logs tunnel 2>&1 | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)"
  [ -n "$url" ] && break
  sleep 1
done
[ -n "$url" ] || { echo "the tunnel printed no address; see: docker compose logs tunnel"; exit 1; }

# Only the app is recreated: the tunnel keeps running, so the address stays the same.
BASE_URL="$url" docker compose up -d --no-deps app
echo "ForwardCheck is live at $url/chat"
