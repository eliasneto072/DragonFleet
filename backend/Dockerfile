# ---- Build Stage ----
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

# Só o schema, e não a pasta prisma inteira.
#
# O postinstall corre "prisma generate", que precisa do schema presente no
# momento do install — daí ele vir antes do npm ci. Mas o generate NÃO precisa
# das migrações, e copiá-las aqui fazia com que criar uma migração invalidasse
# a camada do npm ci e obrigasse a reinstalar centenas de pacotes.
COPY prisma/schema.prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci

# As migrações entram depois: mexer nelas já não custa uma reinstalação.
COPY prisma ./prisma/

COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# ---- Production Stage ----
FROM node:22-alpine AS production

WORKDIR /app

COPY package*.json ./

# Mesma separação do estágio de build, pela mesma razão.
COPY prisma/schema.prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci --omit=dev

# migrate deploy corre no arranque e precisa dos ficheiros de migração.
COPY prisma ./prisma/

COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Roda as migrations e sobe o servidor
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]