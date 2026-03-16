# ============================================================
# XekuChat — Multi-stage Build
# ============================================================

# ---- Stage 1: Build ----
FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json bunfig.toml ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

RUN bun install --frozen-lockfile

COPY . .

# Generate Prisma client
RUN cd packages/server && bunx prisma generate

# Build client
RUN cd packages/client && bun run build

# Build server
RUN cd packages/server && bun run build

# ---- Stage 2: Production ----
FROM oven/bun:1-slim AS production
WORKDIR /app

COPY --from=builder /app/packages/server/dist ./dist
COPY --from=builder /app/packages/server/prisma ./prisma
COPY --from=builder /app/packages/server/node_modules/.prisma ./.prisma
COPY --from=builder /app/packages/client/dist ./public
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "dist/index.js"]
