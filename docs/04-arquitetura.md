# 04 · Arquitetura

## Stack

| Camada | O quê |
|---|---|
| Frontend | React 18, TypeScript, Vite, TailwindCSS v4, shadcn/ui, TanStack Query |
| Backend | Node 22, Express 5, Prisma, Zod |
| Base de dados | PostgreSQL 16 |
| Ficheiros | Cloudinary |
| Email | Resend |
| Local | Docker Compose · nginx à frente do frontend |
| Produção | Render (API + base) · Cloudflare Pages (frontend) |

A interface e os comentários do código estão em **português europeu**. Não é
preferência de estilo: o cliente e os motoristas são portugueses, e um sistema
que diz "saque" a quem diz "retirada" perde credibilidade na primeira tela.

---

## Estrutura

```
backend/src/
  modules/          um por domínio, com routes/controller/service/repository/schemas
    analytics  auth  balance  bank  companies  documents  earnings
    notifications  reports  settings  settlements  support  upload
    users  vehicles  withdrawals
  middlewares/      auth, erros, upload
  shared/           utils (iban, week), http (pagination, response), errors
  jobs/             scheduler — validade de documentos
  config/           env.ts, prisma.ts
  test/             harness dos testes de integração

frontend/src/
  app/
    components/     as telas grandes, por área (admin/, driver/, ui/)
    providers/      RootLayout — proteção de rotas
    router/         todas as rotas num ficheiro
  features/         admin/ auth/ driver/ landing/ theme/
    <área>/pages/       as páginas
    <área>/services/    as chamadas à API
  shared/
    lib/api-client.ts   o cliente HTTP — token, erros, renovação, upload
    types/api.ts        os tipos da API
    hooks/  lib/  services/
```

O `app/components/` e o `features/*/pages/` convivem por razões históricas: as
páginas são casca fina e o conteúdo pesado vive em `components/`. Não é o desenho
que se escolheria de raiz, mas é consistente.

---

## O cliente HTTP

`shared/lib/api-client.ts` é o sítio por onde passam todos os pedidos, e concentra
quatro responsabilidades que antes estavam espalhadas.

**Token e erros.** Todos os erros saem como `ApiError` com o `code` do backend —
é isso que permite distinguir `BANK_ACCOUNT_REQUIRED` de `MISSING_RECEIPT` na
interface em vez de mostrar "erro inesperado".

**Envio de ficheiros.** O `request()` deteta `FormData` e omite o `Content-Type`,
porque num multipart o browser tem de o definir para incluir o *boundary*. Antes,
cada tela de upload nascia com o seu `fetch` cru, e nenhum passava pela renovação
da sessão.

**Renovação silenciosa.** Um 401 desencadeia um refresh e repete o pedido, com
fila para os pedidos simultâneos.

**As rotas que não renovam.** `/auth/login`, `/auth/register` e `/auth/refresh`
estão numa lista de exceção. Um 401 nessas rotas quer dizer "credenciais
erradas", não "token expirado" — e sem a exceção, uma palavra-passe errada
disparava o refresh, falhava, e caía num `window.location.href = '/login'` que,
estando o utilizador já em `/login`, era um recarregamento da página. O
formulário esvaziava e o erro desaparecia antes de ser lido.

---

## Decisões que valem a pena conhecer

**A view `driver_balances`.** O saldo é uma view em SQL e não uma soma repetida
em cada consulta. Três sítios calculavam-no de maneiras ligeiramente diferentes.

**Nome do projeto Docker fixo.** O `docker-compose.yml` declara
`name: dragonfleet`. Sem isso, o Compose deriva o nome da pasta e os volumes
ficam prefixados por ele — renomear ou mover a pasta troca o volume por baixo dos
pés e o Postgres arranca com uma base vazia, sem nada indicar porquê.

**Base de testes separada, sem volume.** O `postgres-test` corre em `tmpfs`, na
memória, e o harness recusa correr contra qualquer base cujo nome não termine em
`_test`. Os testes de integração apagam todas as tabelas entre casos.

**A verificação de ambiente rebenta antes de abrir a porta.** O `assertEnv()`
corre no `server.ts` antes do `listen`. Um servidor mal configurado que arranca e
responde parece que está bem, e é assim que fica meses no ar sem ninguém dar por
isso.

**O `prisma generate` corre no `postinstall`.** Por isso o Dockerfile copia
`schema.prisma` *antes* do `npm ci`, e as migrações só depois — assim, criar uma
migração não invalida a camada do install.

---

## A recolha automática Uber/Bolt

O cliente não conseguiu acesso à API das plataformas. A decisão foi uma
**extensão de browser** que lê a página que ele já tem aberta nos portais.

A extensão é a via principal; o CSV é a secundária, para quando a extensão falhar
ou o portal mudar de aspeto, e para carregar semanas antigas. Ambas entram pela
mesma tela de conferência.

A extensão automatiza a **recolha dos valores**, não o fecho. O fecho continua a
ser um ato do administrador.

### O risco por confirmar

O `csv-parser.ts` casa cabeçalhos por lista de sinónimos: primeiro igualdade
exata, depois inclusão. Se um ficheiro da Uber tiver também uma coluna de bruto —
algo como "Rendimentos brutos" — a busca por inclusão devolve a **primeira**
coluna que contenha "rendimento". Se o bruto vier primeiro, importa-se o bruto em
vez do líquido, em silêncio, e o fecho fica inflado.

Corrigir isto exige ver um ficheiro real. Acrescentar sinónimos às cegas é
palpite.

Nota de vocabulário: a Uber escreve "Monica Luis" e a Bolt escreve "Mónica Luis".
Os acentos são normalizados ao casar nomes.

---

## Segurança

**`helmet`** com a CSP desligada. O frontend é servido de outro domínio, portanto
a política que interessa é a de lá; uma CSP mal calibrada aqui bloquearia
respostas da API sem que ninguém percebesse porquê.

**CORS** restrito à lista configurada. Lista vazia — só possível fora de produção
— mantém o comportamento aberto, para uma máquina local com o frontend noutra
porta e a extensão a chamar de um `chrome-extension://`.

**Limite de tentativas** em `/auth/login`, `/auth/refresh` e no registo público.
Conta apenas os falhanços: quem acerta na palavra-passe entra as vezes que
quiser.

**`trust proxy` em 1**, e não `true`. No Render a aplicação fala com o
balanceador, não com o browser. Sem isto, `req.ip` é o do balanceador e todos os
visitantes partilham o mesmo IP aos olhos do limite. Com `true`, aceita-se a
cadeia toda incluindo o que o cliente escrever, e qualquer pessoa forja o seu IP.

**Segredos** com mínimo de 32 caracteres, e o servidor recusa qualquer um que
contenha `change-me`. Os dois JWT têm de ser diferentes.

### Ainda por fazer

- Sem HTTPS no `docker-compose` local — em produção o Render e o Cloudflare
  tratam disso.
- Sem cópias de segurança configuradas à mão; o plano do Render traz as suas.
- Três vulnerabilidades altas do `npm audit`, todas na cadeia
  `prisma → @prisma/config → deepmerge-ts`. **Nunca correr `npm audit fix
  --force`**: ignora os intervalos semver e é capaz de trocar o Vite ou o React
  por versões incompatíveis.
