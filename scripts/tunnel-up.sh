#!/usr/bin/env bash
# Start the app and its Cloudflare tunnel, then point the app's links at the tunnel's address.
#   scripts/tunnel-up.sh
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"

# The tunnel first, and left alone if it is already running: its address changes whenever it restarts.
docker compose up -d tunnel

# Ask the tunnel itself for its address. (Its log also holds the addresses of earlier starts.)
url=""
for _ in $(seq 1 30); do
  host="$(curl -s --max-time 3 http://127.0.0.1:20241/quicktunnel | sed -nE 's/.*"hostname":"([^"]+)".*/\1/p' || true)"
  [ -n "$host" ] && { url="https://$host"; break; }
  sleep 1
done
[ -n "$url" ] || { echo "the tunnel reported no address; see: docker compose logs tunnel"; exit 1; }

BASE_URL="$url" docker compose up -d --build app

# Do not announce an address that does not answer yet.
for _ in $(seq 1 30); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url/health")" = 200 ] && { echo "ForwardCheck is live at $url/chat"; exit 0; }
  sleep 2
done
echo "the app is up, but $url did not answer; see: docker compose logs tunnel"
exit 1
