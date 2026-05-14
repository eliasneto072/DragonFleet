# ---- Build Stage ----
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

# Copia o schema ANTES do npm ci — o postinstall roda "prisma generate"
# e precisa do schema.prisma presente no momento do install
COPY prisma ./prisma/

RUN npm ci

COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# ---- Production Stage ----
FROM node:22-alpine AS production

WORKDIR /app

COPY package*.json ./

# Mesma coisa no estágio de produção
COPY prisma ./prisma/

RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Roda as migrations e sobe o servidor
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]