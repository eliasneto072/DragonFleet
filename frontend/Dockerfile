# ---- Build Stage ----
FROM node:22-alpine AS builder

# pnpm é necessário pois o projeto usa overrides de pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./

# Fallback para npm caso não exista pnpm-lock.yaml
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else npm install; fi

COPY . .

# ARG permite passar a URL da API em build-time
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL

RUN if [ -f pnpm-lock.yaml ]; then pnpm run build; else npm run build; fi

# ---- Production Stage ----
FROM nginx:stable-alpine AS production

# Remove config padrão do nginx
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copia o build gerado pelo Vite
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]