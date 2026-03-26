FROM node:20-alpine AS base

WORKDIR /app

COPY package*.json ./
COPY backend/package*.json backend/
COPY frontend/package*.json frontend/
COPY shared/package*.json shared/

# Addon runtime labels (flat keys, no JSON-in-label).
LABEL \
  namorix.addon.id="thread" \
  namorix.addon.display_name="Thread" \
  namorix.addon.entry="/assets/thread.js" \
  namorix.addon.styles="/assets/thread.css" \
  namorix.addon.element="nmx-thread-main" \
  namorix.addon.internal_port="4000" \
  namorix.addon.window_width="1100" \
  namorix.addon.window_height="700"

FROM base AS prod
RUN npm ci
COPY . .
RUN npm run build:backend && npm run build:addon
EXPOSE 4000
CMD ["node", "backend/dist/index.js"]

FROM base AS dev
RUN npm install
EXPOSE 4000
CMD ["npx", "tsx", "watch", "backend/src/index.ts"]
