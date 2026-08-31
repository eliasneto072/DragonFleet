# Pôr o DragonFleet em produção

Esta lista existe porque um servidor mal configurado **arranca e responde**. Um
sistema inseguro que funciona parece que está bem, e ninguém vai lá ver.

O servidor recusa arrancar se algo desta lista estiver por fazer, quando
`NODE_ENV=production`. Isso é de propósito.

---

## 1. Gerar os segredos

```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET
openssl rand -base64 24   # POSTGRES_PASSWORD
```

**Os dois JWT têm de ser diferentes.** O de refresh vive sete dias e o de
acesso quinze minutos; partilhá-los faz um token curto poder ser usado como
longo.

O servidor recusa qualquer segredo com menos de 32 caracteres ou que contenha
`change-me`.

## 2. Preencher o `.env`

Copiar o `backend/.env.example` e preencher. O que **não pode ficar vazio** em
produção:

| Variável | Porquê |
|---|---|
| `NODE_ENV=production` | é o que aperta tudo o resto |
| `JWT_SECRET` | sem ele, qualquer pessoa forja um token de administrador |
| `JWT_REFRESH_SECRET` | idem, com validade de sete dias |
| `CORS_ORIGINS` | sem ele, qualquer site faz pedidos em nome de quem tem sessão |
| `POSTGRES_PASSWORD` | não pode ser a de desenvolvimento |
| `CLOUD_NAME`, `API_KEY`, `API_SECRET` | sem eles, os recibos não são guardados |

`CORS_ORIGINS` leva o endereço do frontend, com o protocolo:
`https://app.dominio.pt`. Vários separam-se por vírgula.

## 3. Limpar os dados de teste

```bash
# os 2000 motoristas de desempenho
cd backend
SEED_PERF=1 SEED_PERF_ONLY=limpar DATABASE_URL="..." npx tsx prisma/seed-perf.ts

# os cenários de demonstração
SEED_DEMO=1 SEED_DEMO_PASSWORD=x DATABASE_URL="..." npx tsx prisma/seed-demo.ts
# (este recria; para só apagar, corra-o e depois apague os utilizadores
#  @seed.dragonfleet.local à mão)
```

Confirmar depois que não sobra nada:

```sql
SELECT COUNT(*) FROM users WHERE email LIKE '%@perf.dragonfleet.local';
SELECT COUNT(*) FROM users WHERE email LIKE '%@seed.dragonfleet.local';
```

## 4. Criar o administrador

```bash
docker compose exec -e SEED_ADMIN_EMAIL=... -e SEED_ADMIN_PASSWORD=... \
  backend npx -y tsx prisma/seed-admin.ts
```

## 5. Arrancar

```bash
docker compose up -d --build
docker compose logs -f backend
```

As migrações correm sozinhas no arranque — o `CMD` faz `prisma migrate deploy`.

**Se o backend não arrancar, leia o erro.** Ele diz qual a variável em falta e
como a gerar. Não é uma avaria: é a verificação a fazer o seu trabalho.

---

## O que fica por fazer, e convém saber

**Não há HTTPS aqui.** O `docker-compose` serve HTTP. Em produção tem de haver
um proxy à frente — Caddy, Nginx ou o que o alojamento oferecer — com
certificado. Sem isso, as palavras-passe viajam em claro.

**Não há limite de tentativas no login.** Nada impede alguém de experimentar
palavras-passe em série. Um `express-rate-limit` na rota de autenticação é
pequeno e resolve; não estava no âmbito destes dois dias.

**Não há cópias de segurança.** O volume `postgres_data` é o único sítio onde os
fechos existem. Um `pg_dump` diário para fora da máquina é o mínimo, e é a
diferença entre um percalço e perder o histórico de faturação.

**Os ficheiros estão no Cloudinary**, num serviço americano, e incluem recibos
verdes e comprovativos bancários com nome e IBAN. Funciona e o plano gratuito
chega para a escala atual. Quando crescer, vale a pena armazenamento na Europa —
e a troca é num ficheiro só, o `upload.service.ts`.
