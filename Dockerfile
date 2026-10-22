# syntax=docker/dockerfile:1

# ---------- 1) dependencies ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- 2) build (also used by the "seed" service in docker-compose) ----------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    DOCKER_BUILD=1 \
    # Placeholder values only so modules can load during the build. NOT carried into the final image.
    BETTER_AUTH_SECRET=build-time-placeholder-secret-not-used-at-runtime \
    BETTER_AUTH_URL=http://localhost:3000 \
    DATABASE_URL=postgres://build:build@localhost:5432/build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build \
 && mkdir -p /data/uploads && chown -R 1001:1001 /data

# ---------- 3) runtime ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    UPLOAD_DIR=/data/uploads \
    HOME=/home/nextjs

# Claude Code CLI: used as an optional AI provider (src/lib/ai-cli.ts). Login state
# persists via the /home/nextjs volume, so it survives rebuilds/restarts.
RUN npm install -g @anthropic-ai/claude-code

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs \
 && mkdir -p /data/uploads /home/nextjs && chown -R nextjs:nodejs /data /home/nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# SQL migration files are read at startup (AUTO_MIGRATE=1)
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

USER nextjs
EXPOSE 3000
VOLUME ["/data/uploads", "/home/nextjs"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/login >/dev/null || exit 1
CMD ["node", "server.js"]
