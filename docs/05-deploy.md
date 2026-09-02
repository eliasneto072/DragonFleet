# 05 · Publicação

**API e base de dados no Render. Frontend no Cloudflare Pages.**

O `docker-compose.yml` não entra aqui — é para a máquina local. Do lado da
produção, o Render usa o `backend/Dockerfile` e o Cloudflare Pages **não usa
Dockerfile nenhum**: faz `npm run build` e serve o `dist/`.

Esta lista existe porque um servidor mal configurado **arranca e responde**. Um
sistema inseguro que funciona parece que está bem, e ninguém vai lá ver. O
backend recusa arrancar se algo aqui estiver por fazer quando
`NODE_ENV=production`. É de propósito.

---

## A ordem importa, e porquê

> **O `VITE_API_URL` é lido no momento da construção, não em execução.**

O Vite substitui-o pelo valor literal dentro do JavaScript gerado. Não se muda
depois no painel: mudar obriga a reconstruir o frontend.

Daí a sequência ser esta e não outra:

```
1. Base de dados          →  dá a DATABASE_URL
2. API                    →  dá o endereço para o VITE_API_URL
3. Frontend               →  dá o endereço para o CORS_ORIGINS
4. Voltar à API           →  preencher o CORS_ORIGINS
```

Entre o passo 2 e o 4, **a API arranca e falha no CORS**. É esperado: o `env.ts`
exige-o em produção e o endereço do frontend ainda não existe. Não é avaria.

---

## Antes de começar

- Contas no [Render](https://render.com) e na
  [Cloudflare](https://cloudflare.com). Ambas aceitam entrar com o GitHub.
- O repositório acessível ao Render. Já é público.
- As chaves do Cloudinary à mão: `CLOUD_NAME`, `API_KEY`, `API_SECRET`. Sem elas
  o backend recusa arrancar em produção.
- A chave do Resend, se quiser os emails.

---

## 1 · Base e API, pelo `render.yaml`

Há duas formas. A rápida é o ficheiro.

**Render → New → Blueprint → apontar ao repositório.**

O Render lê o [`render.yaml`](../render.yaml) da raiz e cria a base e o serviço
de uma vez. O ficheiro está comentado bloco a bloco; o essencial:

| Bloco | O que faz | Porquê assim |
|---|---|---|
| `region: frankfurt` | Base e API no mesmo datacentre europeu | Os utilizadores estão em Portugal, e há IBAN e documentos de identificação em jogo |
| `plan: basic-256mb` | Plano pago para a base | O gratuito do Render **apaga a base ao fim de 30 dias**, e é o único sítio onde os fechos existem |
| `fromDatabase: connectionString` | Liga a API à base | É a ligação **interna** — não sai para a internet |
| `generateValue: true` | Gera os dois segredos JWT | Nunca passam pelo Git nem pelo seu terminal, e saem diferentes um do outro |
| `sync: false` | Pergunta no painel | Para o que o Render não pode saber: Cloudinary, Resend, e o CORS que ainda não existe |
| `buildFilter` | Só reconstrói se `backend/**` mudar | Sem isto, uma vírgula no frontend dispara três minutos de build |
| `ipAllowList: []` | Base fechada à internet | Só serviços do Render, pela rede interna |

**Guarde o endereço da API.** Fica algo como
`https://dragonfleet-api.onrender.com`.

As migrações correm sozinhas: o `CMD` do Dockerfile faz `prisma migrate deploy`
antes de arrancar o servidor.

### Se preferir montar à mão

New → Web Service → o repositório → Docker, com `backend/Dockerfile` e contexto
em `backend`. Região Frankfurt. As variáveis são as do `render.yaml`.

---

## 2 · Frontend no Cloudflare Pages

**Workers & Pages → Create → Pages → Connect to Git.**

| Campo | Valor |
|---|---|
| Root directory | `frontend` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Variável | `VITE_API_URL` = o endereço do passo 1 |

Dois ficheiros em `frontend/public/` fazem o resto, e ambos são necessários
porque o `nginx.conf` **não existe** neste deploy:

**`_redirects`** — encaminha as rotas do React. Sem ele, abrir
`/app/admin/financial` diretamente, ou dar F5 numa rota interna, devolve 404: o
Pages procura um ficheiro com esse nome e não o encontra. A rota existe no React,
mas o React só corre depois de o `index.html` ser servido.

**`_headers`** — cache curta para o que não tem hash no nome. O Vite põe hash no
JS e no CSS, mas os ficheiros de `public/` — o `favicon.ico`, os PNG da marca —
chegam com o nome intacto. Guardá-los com validade longa transforma uma troca de
logótipo num problema de um ano.

---

## 3 · Ligar os dois

De volta ao Render, preencher:

```
CORS_ORIGINS=https://dragonfleet.pages.dev
FRONTEND_URL=https://dragonfleet.pages.dev
```

O serviço reinicia e passa a aceitar.

**Duas armadilhas aqui.** As pré-visualizações do Pages têm endereços próprios,
do género `a1b2c3.dragonfleet.pages.dev`, e vão bater no CORS. E a extensão chama
de um `chrome-extension://`, que não é uma origem HTTP — pode ser preciso
acrescentá-la à lista.

---

## Limpar os dados de teste

A base do Render nasce vazia, portanto não deve haver nada. Confirme na mesma —
e se estiver a reaproveitar uma base:

```sql
SELECT COUNT(*) FROM users WHERE email LIKE '%@perf.dragonfleet.local';
SELECT COUNT(*) FROM users WHERE email LIKE '%@seed.dragonfleet.local';
```

Se houver, corra os seeds em modo de limpeza a partir da sua máquina, com a
`DATABASE_URL` **externa**:

```bash
cd backend
SEED_PERF=1 SEED_PERF_ONLY=limpar DATABASE_URL="..." npx tsx prisma/seed-perf.ts
```

---

## Criar o administrador

Corre da sua máquina, com a `DATABASE_URL` externa. Os seeds **não** correm
dentro do contentor de produção, porque lá não existe `src/`.

```bash
cd backend
DATABASE_URL="..." \
SEED_ADMIN_EMAIL="admin@dragonfleet.com" \
SEED_ADMIN_PASSWORD="umaSenhaForte123" \
npx tsx prisma/seed-admin.ts
```

Para isto funcionar, acrescente o seu IP ao `ipAllowList` da base no painel do
Render. **Tire-o outra vez a seguir.**

---

## Verificar

Por esta ordem, porque cada um depende do anterior:

1. Entrar com o administrador
2. Criar um motorista
3. Abrir a Faturação e o Painel
4. Registar um fecho
5. Submeter um IBAN e aprová-lo
6. Pedir uma retirada com recibo
7. Testar a extensão contra um portal

Se algo falhar por CORS, aparece na consola do browser com essa palavra. É o
sintoma mais provável.

---

## O que fica por fazer

**Uma rota `GET /health`.** Não existe, e por isso o `render.yaml` não define
`healthCheckPath` — apontar para uma rota inexistente faz o Render dar o serviço
por morto e reiniciá-lo em ciclo. Sem o campo, ele dá-o por vivo quando a porta
abre, o que é verdade mas mais fraco: um backend de pé com a base inacessível
passa na mesma. A rota é trabalho de minutos.

**As cópias de segurança.** Vêm no plano do Render, mas confirme a retenção e
**teste restaurar uma**. Uma cópia que nunca foi restaurada é uma suposição.

**O domínio próprio.** A Cloudflare trata do DNS, com o `www` a redirecionar para
a raiz. Obriga a acrescentar o novo endereço ao `CORS_ORIGINS` e a reconstruir o
frontend se o endereço da API também mudar. Não faça isto à pressa: a propagação
pode demorar horas.

**Os ficheiros estão no Cloudinary**, num serviço americano, e incluem recibos
verdes e comprovativos bancários com nome e IBAN. Funciona, e o plano gratuito
chega para a escala atual. Quando crescer, vale a pena armazenamento na Europa —
e a troca é num ficheiro só, o `upload.service.ts`.

---

## Publicar com Docker Compose

Se um dia isto for para uma máquina própria em vez do Render, o
`docker-compose.yml` serve. Mas então falta o que o Render e a Cloudflare davam
de graça:

- **HTTPS.** O Compose serve HTTP. Tem de haver um proxy à frente — Caddy, Nginx
  ou o que o alojamento oferecer — com certificado. Sem isso as palavras-passe
  viajam em claro.
- **Portas fechadas.** O Compose expõe o Postgres em 5433 e a API em 3000. Em
  produção só o nginx deve estar público.
- **Cópias de segurança.** O volume `postgres_data` passa a ser o único sítio
  onde os fechos existem. Um `pg_dump` diário para fora da máquina é o mínimo.
