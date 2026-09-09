#!/usr/bin/env bash
set -euo pipefail
umask 077
CONFIG=/etc/resellnom-agent.conf
[[ -r "$CONFIG" ]] || { echo "Missing $CONFIG" >&2; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG"
: "${MONITOR_URL:?MONITOR_URL is required}"
: "${AGENT_TOKEN:?AGENT_TOKEN is required}"
command -v curl >/dev/null || exit 1
command -v awk >/dev/null || exit 1

num(){ awk "BEGIN {printf \"%.2f\", $1+0}"; }
cpu(){ awk '/^cpu /{u=$2+$4; t=$2+$4+$5; print (t?100*u/t:0); exit}' /proc/stat; }
ram(){ awk '/MemTotal:/{t=$2}/MemAvailable:/{a=$2}END{print (t?100*(t-a)/t:0)}' /proc/meminfo; }
disk(){ df -P / | awk 'NR==2{gsub(/%/,"",$5);print $5}'; }
load1(){ awk '{print $1}' /proc/loadavg; }
uptime(){ awk '{print int($1)}' /proc/uptime; }
service_json(){ local s out=""; for s in nginx apache2 httpd mysql mariadb php-fpm php8.3-fpm docker; do if systemctl list-unit-files "${s}.service" --no-legend 2>/dev/null | grep -q .; then systemctl is-active --quiet "$s" && v=running || v=down; out+="\"$s\":\"$v\","; fi; done; printf '{%s}' "${out%,}"; }
rx_tx(){ awk 'BEGIN{rx=tx=0}/:/{gsub(":","",$1); if($1!="lo"){rx+=$2;tx+=$10}}END{print rx,tx}' /proc/net/dev; }
read -r RX TX < <(rx_tx)
JSON=$(printf '{"cpu":%s,"ram":%s,"disk":%s,"load1":%s,"rx":%s,"tx":%s,"uptime":%s,"services":%s}' "$(num "$(cpu)")" "$(num "$(ram)")" "$(num "$(disk)")" "$(num "$(load1)")" "$(num "$RX")" "$(num "$TX")" "$(uptime)" "$(service_json)")
curl --fail --silent --show-error --connect-timeout 5 --max-time 10 --proto '=https' --tlsv1.2 -H 'Content-Type: application/json' -H "X-ResellNom-Agent: $AGENT_TOKEN" --data "$JSON" "$MONITOR_URL/agent/heartbeat" >/dev/null
