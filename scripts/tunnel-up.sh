#!/usr/bin/env bash
# Start the app and its Cloudflare tunnel, then point the app's links at the tunnel's address.
#   scripts/tunnel-up.sh
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"

# Ask the tunnel itself for its address. (Its log also holds the addresses of earlier starts.)
tunnel_url() {
  local host
  for _ in $(seq 1 30); do
    host="$(curl -s --max-time 3 http://127.0.0.1:20241/quicktunnel | sed -nE 's/.*"hostname":"([^"]+)".*/\1/p' || true)"
    [ -n "$host" ] && { echo "https://$host"; return 0; }
    sleep 1
  done
  return 1
}

# Point the app at $1 and wait for that address to answer from outside.
serve_at() {
  BASE_URL="$1" docker compose up -d --build app
  for _ in $(seq 1 20); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$1/health")" = 200 ] && return 0
    sleep 2
  done
  return 1
}

# The tunnel first, and left alone if it is already running: its address changes whenever it restarts.
docker compose up -d tunnel
url="$(tunnel_url)" || { echo "the tunnel reported no address; see: docker compose logs tunnel"; exit 1; }

if ! serve_at "$url"; then
  # Cloudflare drops a quick tunnel that was out of touch for a while (the Mac slept): the container keeps
  # running and keeps reporting an address that no longer exists. Only a restart gets a new one.
  echo "$url no longer answers: restarting the tunnel for a new address"
  docker compose restart tunnel
  sleep 3
  url="$(tunnel_url)" || { echo "the tunnel reported no address; see: docker compose logs tunnel"; exit 1; }
  serve_at "$url" || { echo "the app is up, but $url did not answer; see: docker compose logs tunnel"; exit 1; }
fi
echo "ForwardCheck is live at $url/chat"
