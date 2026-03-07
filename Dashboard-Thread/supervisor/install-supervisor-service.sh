#!/bin/bash
# Cài systemd service: supervisor (socket + watch device). Một service thay otbr-watch-device.
# Từ Dashboard-Thread: sudo bash ./supervisor/install-supervisor-service.sh [container-name] [device-path]
# Gỡ: sudo systemctl disable --now dashboard-thread-supervisor && sudo rm /etc/systemd/system/dashboard-thread-supervisor.service && sudo systemctl daemon-reload

set -e
CONTAINER_NAME="${1:-dashboard-thread-otbr}"
DEVICE_PATH="${2:-/dev/ttyACM0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_PY="$SCRIPT_DIR/server.py"
UNIT_FILE="/etc/systemd/system/dashboard-thread-supervisor.service"

if [ ! -f "$SERVER_PY" ]; then
  echo "Not found: $SERVER_PY"
  exit 1
fi

cat > "$UNIT_FILE" << UNIT
[Unit]
Description=Dashboard-Thread supervisor: socket /var/run/izerocs/supervisor.sock + watch RCP device, restart OTBR
After=docker.service network.target
Requires=docker.service

[Service]
Type=simple
Environment=OTBR_CONTAINER_NAME=$CONTAINER_NAME
Environment=DEVICE_PATH=$DEVICE_PATH
Environment=INTERVAL=5
ExecStartPre=-/usr/sbin/sysctl -w net.ipv4.ip_forward=1
ExecStartPre=-/usr/sbin/sysctl -w net.ipv6.conf.all.forwarding=1
ExecStart=/usr/bin/python3 $SERVER_PY
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now dashboard-thread-supervisor.service
echo "Installed and started: dashboard-thread-supervisor.service"
echo "  Container: $CONTAINER_NAME, Device: $DEVICE_PATH"
echo "  Socket: /var/run/izerocs/supervisor.sock"
echo "  To change: edit $UNIT_FILE (Environment=...), then sudo systemctl daemon-reload && sudo systemctl restart dashboard-thread-supervisor"
echo "  Uninstall: sudo systemctl disable --now dashboard-thread-supervisor && sudo rm $UNIT_FILE && sudo systemctl daemon-reload"
