#!/usr/bin/env bash
# =====================================================================
# Run one JMeter plan at one of the four stages, and write both the raw
# samples and an HTML report under results/.
#
#   ./run.sh catalogue-browse smoke
#   ./run.sh order-checkout load
#   ./run.sh catalogue-browse stress --no-report
#
# Needs Apache JMeter 5.6 or newer on PATH, or JMETER_HOME set, or JMETER_CMD
# pointing straight at the launcher. There is deliberately no download step:
# a load generator that installs itself mid-run is one more variable in a
# measurement that is supposed to have few.
#
# The PowerShell twin of this script is run.ps1; keep the two in step.
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")"

plan="${1:-}"
stage="${2:-load}"
shift 2 2>/dev/null || true

usage() {
  cat <<'USAGE'
usage: run.sh <plan> [stage] [--no-report] [-Jkey=value ...]

  plan    catalogue-browse | order-checkout   (or a path to any .jmx here)
  stage   smoke | load | stress | spike       (default: load)

Anything after the stage is passed to JMeter unchanged, so a single value can
be overridden without editing anything:

  ./run.sh catalogue-browse load -Jthreads=50 -Jgateway.host=192.0.2.10
USAGE
}

if [[ -z "$plan" || "$plan" == "-h" || "$plan" == "--help" ]]; then
  usage
  exit 1
fi

[[ "$plan" == *.jmx ]] || plan="${plan}.jmx"
if [[ ! -f "$plan" ]]; then
  echo "No such plan: $plan" >&2
  usage
  exit 1
fi

# --- the four stages -------------------------------------------------
# Kept here rather than in profiles.properties because a properties file can
# only describe one stage at a time.
case "$stage" in
  smoke)  stage_args=(-Jthreads=2   -Jrampup=1  -Jduration=60  -Jthink.time=500 -Jthink.range=1000) ;;
  load)   stage_args=(-Jthreads=20  -Jrampup=30 -Jduration=300 -Jthink.time=500 -Jthink.range=1000) ;;
  stress) stage_args=(-Jthreads=100 -Jrampup=60 -Jduration=600 -Jthink.time=200 -Jthink.range=300) ;;
  spike)  stage_args=(-Jthreads=200 -Jrampup=5  -Jduration=120 -Jthink.time=0   -Jthink.range=200) ;;
  *)
    echo "Unknown stage: $stage" >&2
    usage
    exit 1
    ;;
esac

report=1
extra=()
for arg in "$@"; do
  case "$arg" in
    --no-report) report=0 ;;
    *) extra+=("$arg") ;;
  esac
done

# --- find JMeter -----------------------------------------------------
if [[ -n "${JMETER_CMD:-}" ]]; then
  jmeter_cmd="$JMETER_CMD"
elif [[ -n "${JMETER_HOME:-}" ]]; then
  jmeter_cmd="$JMETER_HOME/bin/jmeter"
elif command -v jmeter >/dev/null 2>&1; then
  jmeter_cmd="jmeter"
else
  cat >&2 <<'MISSING'
JMeter was not found.

Install it, then either put its bin/ on PATH or set JMETER_HOME:

  https://jmeter.apache.org/download_jmeter.cgi

  export JMETER_HOME=/opt/apache-jmeter-5.6.3
  ./run.sh catalogue-browse smoke
MISSING
  exit 127
fi

stamp="$(date +%Y%m%d-%H%M%S)"
name="$(basename "${plan%.jmx}")"
out="results/${name}-${stage}-${stamp}"
mkdir -p "$out"

echo "Plan   : $plan"
echo "Stage  : $stage"
echo "Output : $out"
echo

# -n headless, -t plan, -q properties, -l samples, -j JMeter's own log.
# The -e/-o pair generates the HTML dashboard from the samples afterwards.
args=(-n -t "$plan" -q profiles.properties -l "$out/samples.jtl" -j "$out/jmeter.log" "${stage_args[@]}")
[[ $report -eq 1 ]] && args+=(-e -o "$out/report")
args+=("${extra[@]+"${extra[@]}"}")

"$jmeter_cmd" "${args[@]}"

echo
echo "Samples : $out/samples.jtl"
[[ $report -eq 1 ]] && echo "Report  : $out/report/index.html"
echo "Grafana : the same window is on the TechZone dashboards, per service and per endpoint."
