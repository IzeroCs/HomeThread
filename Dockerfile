FROM node:20-alpine AS base

WORKDIR /app

COPY package*.json ./
COPY backend/package*.json backend/
COPY frontend/package*.json frontend/
COPY shared/package*.json shared/

# Keep only runtime-used manifest fields.
LABEL namorix.manifest='{"id":"thread","displayName":"Thread","entry":"/assets/thread.js","styles":"/assets/thread.css","element":"nmx-thread-main","internalPort":4000,"defaultWindowSize":{"width":1100,"height":700}}'

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
