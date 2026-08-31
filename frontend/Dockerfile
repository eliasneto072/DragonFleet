# ---- Build Stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# package-lock.json entra na imagem de propósito.
#
# Antes copiava-se `pnpm-lock.yaml*` — um ficheiro que este projeto nunca teve —
# e caía-se no `npm install`, que resolve versões novas dentro dos intervalos
# semver a cada build. O build deixava de ser reprodutível: a mesma commit dava
# imagens diferentes consoante o dia, e uma delas podia partir sem ninguém ter
# tocado no código. `npm ci` instala exatamente o que o lockfile fixa.
COPY package.json package-lock.json ./

RUN npm ci

COPY . .

# ARG permite passar a URL da API em build-time
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL

# `npm run build` é agora `tsc -b && vite build`: o typecheck corre ANTES do
# empacotamento. O Vite sozinho apaga os tipos sem os verificar, e um componente
# inexistente ou uma propriedade mal escrita só apareciam como ecrã branco em
# produção. Aqui param o build.
RUN npm run build

# ---- Production Stage ----
FROM nginx:stable-alpine AS production

# Remove config padrão do nginx
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copia o build gerado pelo Vite
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
