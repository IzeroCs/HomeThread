#!/usr/bin/env bash
# rename.sh — Đổi tên file theo hướng br/ (Hướng 1)
# Chạy từ thư mục gốc project: bash rename.sh

set -e

BASE="Dashboard-Thread/backend/src"

echo "=== Bắt đầu rename ==="

# 1. Tạo thư mục br/
mkdir -p "$BASE/communicate/br"

# 2. Di chuyển communicate/manager/ → communicate/br/
mv "$BASE/communicate/manager/command.manager.ts"     "$BASE/communicate/br/br.command.ts"
mv "$BASE/communicate/manager/communicate.manager.ts" "$BASE/communicate/br/br.ts"
rmdir "$BASE/communicate/manager"

# 3. Đổi tên trong thread/
mv "$BASE/thread/thread-config.manager.ts"        "$BASE/thread/thread.config.ts"
mv "$BASE/thread/thread-data.manager.ts"          "$BASE/thread/thread.data.ts"
mv "$BASE/thread/thread-polling.manager.ts"       "$BASE/thread/thread.polling.ts"
mv "$BASE/thread/br-topology-persist.service.ts"  "$BASE/thread/br-topology-persist.ts"

echo "=== Cập nhật imports ==="

# 4. communicate/index.ts
sed -i \
  -e 's|"./manager/communicate.manager"|"./br/br"|g' \
  "$BASE/communicate/index.ts"

# 5. communicate/br/br.ts
sed -i \
  -e 's|"./command.manager"|"./br.command"|g' \
  -e 's|"@thread/thread-config.manager"|"@thread/thread.config"|g' \
  -e 's|"@thread/thread-data.manager"|"@thread/thread.data"|g' \
  -e 's|"@thread/thread-polling.manager"|"@thread/thread.polling"|g' \
  -e 's|"@thread/br-topology-persist.service"|"@thread/br-topology-persist"|g' \
  -e 's|"./command.manager"|"./br.command"|g' \
  "$BASE/communicate/br/br.ts"

echo "=== Kiểm tra import cũ còn sót ==="
RESULT=$(grep -rn \
  "communicate/manager\|command\.manager\|communicate\.manager\|thread-config\.manager\|thread-data\.manager\|thread-polling\.manager\|br-topology-persist\.service" \
  "$BASE" 2>/dev/null || true)

if [ -z "$RESULT" ]; then
  echo "✅ Không còn import cũ nào."
else
  echo "⚠️  Còn sót — cần kiểm tra thủ công:"
  echo "$RESULT"
fi

echo ""
echo "=== Cấu trúc sau rename ==="
find "$BASE/communicate" "$BASE/thread" -type f | sort
