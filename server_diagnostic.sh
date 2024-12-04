#!/bin/bash

# Server Diagnostic Script with Discord Alerts
# Version: 1.0
# Developer: MD Mahfuz Reham


LOG_FILE="/var/log/server_diagnostic.log"
DISCORD_WEBHOOK="https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz" # Replace with your webhook URL

echo "=== Server Diagnostic Report ===" > $LOG_FILE
echo "Generated on: $(date)" >> $LOG_FILE
echo "=================================" >> $LOG_FILE
echo "" >> $LOG_FILE

# 1. System Uptime
echo "[1] System Uptime:" >> $LOG_FILE
uptime >> $LOG_FILE
echo "" >> $LOG_FILE

# 2. CPU Load
echo "[2] CPU Load:" >> $LOG_FILE
top -b -n 1 | grep "Cpu(s)" >> $LOG_FILE
echo "" >> $LOG_FILE

# 3. Memory Usage
echo "[3] Memory Usage:" >> $LOG_FILE
free -h >> $LOG_FILE
echo "" >> $LOG_FILE

# 4. Disk Space Usage
echo "[4] Disk Space Usage:" >> $LOG_FILE
df -h >> $LOG_FILE
echo "" >> $LOG_FILE

# 5. Service Status Checks
declare -A SERVICES=(
  [MySQL]="mariadb"
  [Apache]="httpd"
  [Nginx]="nginx"
  [PHP-FPM]="php-fpm"
)

DOWN_SERVICES=()

echo "[5] Service Status Checks:" >> $LOG_FILE
for SERVICE_NAME in "${!SERVICES[@]}"; do
  SERVICE=${SERVICES[$SERVICE_NAME]}
  if systemctl is-active --quiet $SERVICE; then
    echo "$SERVICE_NAME is running" >> $LOG_FILE
  else
    echo "$SERVICE_NAME is NOT running!" >> $LOG_FILE
    DOWN_SERVICES+=("$SERVICE_NAME")
  fi
done
echo "" >> $LOG_FILE

# Prepare Discord Alert if Critical Services are Down
if [ ${#DOWN_SERVICES[@]} -gt 0 ]; then
  DISCORD_MESSAGE=":warning: **Critical Services Down on Server!** :warning:\n\n"
  for SERVICE in "${DOWN_SERVICES[@]}"; do
    DISCORD_MESSAGE+=":x: $SERVICE is NOT running!\n"
  done

  DISCORD_MESSAGE+="\nGenerated on: $(date)"
  echo -e $DISCORD_MESSAGE >> $LOG_FILE

  # Send Alert to Discord
  curl -H "Content-Type: application/json" \
       -X POST \
       -d "{\"content\": \"$DISCORD_MESSAGE\"}" \
       $DISCORD_WEBHOOK
fi

# Completion
echo "Diagnostic completed. Check the log file at $LOG_FILE"
