#!/usr/bin/env bash
# ForwardCheck's hermetic slice, driven locally. See README.md.
#   run.sh up | baseline | quiet | <scenario> | chaos N | report | no-internet | logs | down
# Scenarios: model-unavailable model-slow model-frozen search-unavailable graph-unavailable app-killed
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
STATE="$HERE/.run"
DOCKER="${DOCKER:-$(command -v docker || echo /Applications/Docker.app/Contents/Resources/bin/docker)}"
export PATH="$(dirname "$DOCKER"):$PATH" # Docker's credential helper lives beside it
SCENARIOS=(model-unavailable search-unavailable graph-unavailable app-killed model-slow)
DRIVERS=(claims judge_disagrees partial_failure duplicate_delivery webhook_signatures repeated_claim late_joiner markup urls)
MAIN="node --import tsx/esm /app/deploy/antithesis/driver/main.ts"
COULD_NOT_RUN=0

dc() { "$DOCKER" compose -f "$HERE/docker-compose.yaml" "$@"; }

# One command, one process, one SDK output file. $2 = the container (driver, or burst for a second address).
run() {
  local name="$1" service="${2:-driver}"
  dc exec -T -w /app -e "ANTITHESIS_SDK_LOCAL_OUTPUT=/state/sdk/${name//:/_}-$RANDOM$RANDOM.jsonl" -e "SETTLE_MS=${SETTLE_MS:-45000}" "$service" $MAIN "$name" || { COULD_NOT_RUN=1; echo "[$name] did not finish"; }
}

certs() {
  [ -f "$STATE/certs/cert.pem" ] && return
  mkdir -p "$STATE/certs"
  cat > "$STATE/certs/openssl.cnf" <<'EOF'
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = forwardcheck-harness
[ext]
basicConstraints = CA:TRUE
subjectAltName = DNS:api.search.brave.com, DNS:factchecktools.googleapis.com, DNS:graph.facebook.com
EOF
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 -config "$STATE/certs/openssl.cnf" -keyout "$STATE/certs/key.pem" -out "$STATE/certs/cert.pem" 2>/dev/null
  chmod 644 "$STATE/certs/key.pem"
}

reset() {
  rm -rf "$STATE/sdk" "$STATE/ledger" "$STATE/cues.jsonl" "$STATE/stub.jsonl" "$STATE/app-kill.json" "$STATE/fault-open" "$STATE/app-down" "$STATE/stop-anytime"
  mkdir -p "$STATE/sdk" "$STATE/ledger"
  COULD_NOT_RUN=0
}

up() {
  certs
  mkdir -p "$STATE/sdk" "$STATE/ledger"
  "$DOCKER" build -q -t forwardcheck-app "$ROOT" || exit 1
  "$DOCKER" build -q -f "$HERE/Dockerfile.driver" --build-arg BASE=forwardcheck-app -t forwardcheck-antithesis-driver "$ROOT" || exit 1
  dc up -d || exit 1
  run first_setup
  [ "$COULD_NOT_RUN" = 0 ] || exit 1
}

ANYTIME_PID=""
anytime_start() { rm -f "$STATE/stop-anytime"; run anytime_health & ANYTIME_PID=$!; }

quiet() {
  echo "== quiet: every parallel_driver_ once, no fault"
  local pids=()
  for name in "${DRIVERS[@]}"; do run "parallel_driver_$name" & pids+=($!); done
  run parallel_driver_rate_limit burst & pids+=($!)
  wait "${pids[@]}"
}

scenario() {
  echo "== fault: $1"
  case "$1" in
    app-killed)
      run scene:app-kill-open
      dc kill app >/dev/null
      dc start app >/dev/null
      run first_setup
      run scene:app-kill-close ;;
    model-unavailable|model-slow|model-frozen|search-unavailable|graph-unavailable) run "scene:$1" ;;
    *) echo "no such scenario: $1"; exit 2 ;;
  esac
}

# The faults are over: stop the probe, let the claims settle, judge.
settle() {
  touch "$STATE/stop-anytime"
  [ -n "$ANYTIME_PID" ] && wait "$ANYTIME_PID"
  echo "== eventually, finally"
  for name in eventually_claims_settle eventually_whatsapp_answered finally_verdicts finally_webhooks finally_restart finally_streams finally_pages finally_rate_limit finally_cache finally_windows; do run "$name"; done
}

report() { dc exec -T -w /app driver node --import tsx/esm /app/deploy/antithesis/driver/report.ts "$@"; }

# A run is a PASS only when the report's check holds, every command finished, and the app is still running.
verdict() {
  local ok=0
  report --require "$1" || ok=1
  [ "$COULD_NOT_RUN" = 0 ] || { echo "a command or scene did not finish: it asserted nothing"; ok=1; }
  [ "$(dc ps --status running --format '{{.Service}}' | grep -c '^app$')" = 1 ] || { echo "the app container is not running"; ok=1; }
  return $ok
}

case "${1:-}" in
  up) up ;;
  quiet) reset; anytime_start; quiet; settle; verdict round ;;
  baseline)
    # The kill comes first: the app's event history dies with it, and the quiet claims' streams are judged afterwards.
    reset; anytime_start
    scenario app-killed
    quiet
    for name in model-unavailable search-unavailable graph-unavailable; do scenario "$name"; done
    settle
    verdict pass; pass=$?
    report --require guards >/dev/null; guards=$?
    [ "$guards" = 0 ] && echo 'harness check "guards": PASS' || { echo 'harness check "guards": FAIL'; report --require guards | tail -n +22; }
    exit $((pass + guards)) ;;
  chaos)
    passed=0
    for ((round = 1; round <= ${2:-5}; round++)); do
      pick="${SCENARIOS[$((RANDOM % ${#SCENARIOS[@]}))]}"
      echo "== chaos round $round: $pick"
      reset; anytime_start; scenario "$pick"; settle
      verdict round && passed=$((passed + 1))
    done
    echo "chaos: $passed/${2:-5} rounds PASS"
    [ "$passed" = "${2:-5}" ] ;;
  report) shift; report "$@" ;;
  no-internet)
    probe='Promise.all(["https://example.com","http://1.1.1.1"].map((u)=>fetch(u,{signal:AbortSignal.timeout(4000)}).then(()=>u,()=>null))).then((r)=>{const got=r.filter(Boolean);console.log(got.length?"REACHED "+got.join(" "):"no route out");process.exit(got.length?1:0)})'
    ok=0
    for service in app driver stub; do printf '%s: ' "$service"; dc exec -T "$service" node -e "$probe" || ok=1; done
    [ "$ok" = 0 ] && echo 'harness check "no-internet": PASS' || echo 'harness check "no-internet": FAIL'
    exit $ok ;;
  logs) shift; dc logs "$@" ;;
  down) dc down -v ;;
  "") echo "usage: run.sh up | baseline | quiet | <scenario> | chaos N | report | no-internet | logs | down"; exit 2 ;;
  *) reset; anytime_start; scenario "$1"; settle; verdict round ;;
esac
