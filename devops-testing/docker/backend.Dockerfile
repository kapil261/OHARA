# Backend image (Express 5 + Prisma). Build context = repo root.
FROM node:20-slim AS build
WORKDIR /app/backend
# Prisma needs OpenSSL on the slim image
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
RUN npm ci
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY backend/tsconfig*.json ./
COPY backend/src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app/backend
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/prisma ./prisma
COPY backend/package.json ./
EXPOSE 4000

# Apply the committed Prisma migrations, then start the API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
