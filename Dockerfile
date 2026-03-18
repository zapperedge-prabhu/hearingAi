# ===== Stage 1: Build =====
FROM node:20-slim AS builder
WORKDIR /app

# Install deps (use lockfile for reproducible builds)
COPY package*.json ./
RUN npm ci && sync

# Copy source and build
COPY . .
ENV NODE_ENV=production
RUN npm run build

# Keep only prod dependencies
RUN npm prune --production

# Pack artifacts to avoid COPY checksum/symlink issues
RUN tar -C /app -cf /tmp/build-artifacts.tar dist node_modules package.json


# ===== Stage 2: Obfuscate (JS only) =====
FROM node:20-slim AS obfuscator
WORKDIR /app

# Unpack ONLY dist folder from previous stage (avoid node_modules conflicts)
COPY --from=builder /tmp/build-artifacts.tar /tmp/build-artifacts.tar
RUN tar -C /app -xf /tmp/build-artifacts.tar dist && rm /tmp/build-artifacts.tar

# Install obfuscator (build-time only) - clean install without conflicts
RUN npm install --no-audit --no-fund javascript-obfuscator@4.1.0

# 1) Obfuscate JS in /dist -> /dist-obf (keeps folder structure)
RUN npx javascript-obfuscator ./dist \
      --output ./dist-obf \
      --exclude node_modules \
      --compact true \
      --self-defending true

# 2) Copy ALL non-JS assets (html, css, images, maps, etc.) into /dist-obf
RUN set -eux; \
    cd /app; \
    find dist -type f ! -name '*.js' -printf '%P\0' \
    | xargs -0 -I{} sh -c 'mkdir -p "dist-obf/$(dirname "{}")"; cp "dist/{}" "dist-obf/{}"'


# ===== Stage 3: Final (runtime) =====
FROM node:20-slim AS final
WORKDIR /app

# Security: run as non-root
RUN useradd -m -r -s /bin/false appuser

# Bring in obfuscated dist (complete app: js + html/css/assets)
COPY --from=obfuscator /app/dist-obf ./dist

# Bring in prod node_modules + package.json from builder (via tar)
COPY --from=builder /tmp/build-artifacts.tar /tmp/build-artifacts.tar
RUN tar -C /app -xf /tmp/build-artifacts.tar node_modules package.json && rm /tmp/build-artifacts.tar

# Prod settings
ENV NODE_ENV=production
EXPOSE 5000

# Permissions and run
USER appuser
CMD ["node", "dist/index.js"]
