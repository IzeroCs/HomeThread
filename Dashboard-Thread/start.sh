#!/bin/bash

# Script để chạy cả backend và frontend cùng lúc

echo "🚀 Starting Dashboard Thread..."
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Check if concurrently is installed
if ! command -v npx &> /dev/null; then
    echo "❌ npm/npx not found. Please install Node.js first."
    exit 1
fi

echo "✅ Starting Backend and Frontend..."
echo ""
echo "Backend:  http://localhost:8080 (WebSocket)"
echo "Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both services"
echo ""

# Run both services
npm run dev
