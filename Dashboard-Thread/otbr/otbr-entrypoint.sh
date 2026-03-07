#!/bin/bash
# Đợi RCP (by-id) có mặt rồi start OTBR. Rút RCP → host udev rule (98-otbr-rcp-remove.rules) chạy script
# kill container → Docker restart policy start lại → entrypoint đợi device lại. Không poll trong container.

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
exec /init
