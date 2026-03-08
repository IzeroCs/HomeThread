#!/bin/bash
set -e
echo "Waiting for RCP device (OT_RCP_DEVICE=$OT_RCP_DEVICE)..."
DEVICE=$(echo "$OT_RCP_DEVICE" | grep -oE '/dev/[^?]+' | head -1)
if [ -z "$DEVICE" ]; then
  echo "Could not parse device from OT_RCP_DEVICE"
  exit 1
fi

while [ ! -e "$DEVICE" ]; do
  echo "Device $DEVICE not found, sleeping 2s..."
  sleep 2
done

echo "Device $DEVICE ready, starting OTBR..."

# Generate machine-id nếu chưa có
dbus-uuidgen --ensure 2>/dev/null || true

# Start dbus với socket riêng để share ra host
mkdir -p /run/dbus-otbr
dbus-daemon --config-file=/usr/share/dbus-1/system.conf \
  --address=unix:path=/run/dbus-otbr/system_bus_socket \
  --nopidfile --nofork &
sleep 1

exec /init
