FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN npm ci && npm run db:generate && npm run build && mkdir -p storage/uploads && chown -R node:node storage
USER node
