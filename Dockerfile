# ─── Stage 1: Install dependencies ───
FROM node:20-alpine AS deps

WORKDIR /app

# Copy root + workspace package files
COPY package.json ./
COPY server/package.json server/package-lock.json* server/  
COPY admin/package.json admin/package-lock.json* admin/
COPY display/package.json display/package-lock.json* display/

# Install all workspace dependencies
RUN cd server && npm ci --include=dev \
 && cd ../admin && npm ci --include=dev \
 && cd ../display && npm ci --include=dev

# ─── Stage 2: Build everything ───
FROM node:20-alpine AS builder

WORKDIR /app

# Copy deps from stage 1
COPY --from=deps /app .

# Copy source code
COPY server/ server/
COPY admin/ admin/
COPY display/ display/
RUN mkdir -p demo-media
COPY agent/scripts/ agent/scripts/

# Build server (TypeScript → dist/)
RUN cd server \
 && npm ci --include=dev --no-audit --no-fund \
 && test -x node_modules/.bin/tsc \
 && npm run build

# Build admin UI (Vite → dist/)
RUN cd admin && npm exec vite build

# Build display app (Vite → dist/)
RUN cd display && npm run build

# ─── Stage 3: Production runner ───
FROM node:20-alpine AS runner

# Create non-root user
RUN addgroup -g 1001 -S museumos && \
    adduser -S museumos -u 1001 -G museumos

WORKDIR /app

ENV NODE_ENV=production

# Copy compiled server + production deps
COPY --from=deps /app/server/node_modules server/node_modules
COPY --from=builder /app/server/dist server/dist
COPY --from=builder /app/server/package.json server/

# Copy migrations + seeds + knexfile (Knex runs via tsx at runtime)
COPY --from=builder /app/server/migrations server/migrations
COPY --from=builder /app/server/src/lib/knexfile.ts server/src/lib/knexfile.ts
COPY --from=builder /app/server/seeds server/seeds

# Copy built static assets
COPY --from=builder /app/admin/dist admin/dist
COPY --from=builder /app/display/dist display/dist
COPY --from=builder /app/demo-media demo-media
COPY --from=builder /app/agent/scripts agent/scripts

# Set ownership and switch to non-root user
RUN chown -R museumos:museumos /app
USER museumos

EXPOSE 3401

# Run migrations + seeds then start server
CMD ["sh", "-c", "cd server && NODE_OPTIONS='--import tsx' npx knex migrate:latest --knexfile src/lib/knexfile.ts && NODE_OPTIONS='--import tsx' npx knex seed:run --knexfile src/lib/knexfile.ts && exec node dist/index.js"]
