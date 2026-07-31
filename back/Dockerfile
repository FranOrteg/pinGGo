FROM node:20-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./

# ── Development ──────────────────────────────────────────────────────────────
FROM base AS development
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]

# ── Production ───────────────────────────────────────────────────────────────
FROM base AS production
RUN npm ci --only=production
COPY . .
CMD ["npm", "start"]
