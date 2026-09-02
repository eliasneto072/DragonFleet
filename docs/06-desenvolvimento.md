# 06 · Desenvolvimento

## Correr localmente

```bash
git clone https://github.com/eliasneto072/DragonFleet.git
cd DragonFleet

cp backend/.env.example backend/.env    # ver a secção seguinte
docker compose up -d --build
```

O frontend fica em `http://localhost` e a API em `http://localhost:3000`.

Se o build ficar preso a instalar pacotes, é o `npm ci` — normal, uns minutos.

**Só uma das partes:**

```bash
docker compose build --no-cache frontend   # o Vite embute variáveis em build time
docker compose build backend
```

### Criar o administrador

```bash
docker compose exec -e SEED_ADMIN_EMAIL=admin@dragonfleet.com \
  -e SEED_ADMIN_PASSWORD=umaSenhaForte123 backend \
  node dist/scripts/seed-admin.js
```

---

## O `.env`

Fora de produção, o `env.ts` tolera ausências para uma máquina acabada de clonar
funcionar. O que precisa mesmo:

| Variável | Nota |
|---|---|
| `DATABASE_URL` | Obrigatória sempre |
| `POSTGRES_USER` · `POSTGRES_PASSWORD` · `POSTGRES_DB` | Lidas pelo Compose |
| `JWT_SECRET` · `JWT_REFRESH_SECRET` | Em desenvolvimento aceitam-se os valores de exemplo |
| `CLOUD_NAME` · `API_KEY` · `API_SECRET` | Sem eles, os uploads não são guardados |
| `VITE_API_URL` | `http://localhost:3000` |

Em produção a exigência muda por completo — ver
[05 · Publicação](./05-deploy.md).

Gerar segredos a sério:

```bash
openssl rand -base64 48
```

Mínimo de 32 caracteres, e o servidor recusa qualquer um que contenha
`change-me`. **Os dois JWT têm de ser diferentes**: o de refresh vive sete dias e
o de acesso quinze minutos, e partilhá-los faz um token curto valer como longo.

---

## Dados de teste

**`seed-demo.ts`** — cenários realistas com poucos motoristas, em
`@seed.dragonfleet.local`. É o que se quer para trabalhar.

```bash
SEED_DEMO=1 SEED_DEMO_PASSWORD=x npx tsx prisma/seed-demo.ts
```

**`seed-perf.ts`** — dois mil motoristas em `@perf.dragonfleet.local`, para ver o
que parte com volume. Foi com isto que a paginação do servidor deixou de ser
opcional.

```bash
SEED_PERF=1 npx tsx prisma/seed-perf.ts
SEED_PERF=1 SEED_PERF_ONLY=limpar npx tsx prisma/seed-perf.ts   # apagar
```

As capturas desta documentação são de um ambiente com os dois — daí os números
grandes.

---

## Testes

```bash
cd backend
npm test              # vitest run
npm run test:watch
npm run test:integration
npm run test:all
```

A suite de unidade é de funções puras: IBAN, semanas, casamento de nomes, o
parser de CSV e os tipos do fecho. Não precisa de base de dados.

Os de integração usam o `postgres-test` do Compose: porta 5434, em `tmpfs`, sem
volume. **O harness recusa correr contra qualquer base cujo nome não termine em
`_test`** — essa verificação é o que separa "correu a suite" de "apagou dados a
sério" no dia em que uma variável estiver mal apontada.

O CI corre a cada push e a cada pull request.

---

## Verificar antes de entregar

```bash
cd frontend && npm run typecheck    # tsc -b
cd backend  && npx tsc --noEmit
```

O build do frontend é `tsc -b && vite build`, portanto um erro de tipos parte o
build. É de propósito.

**Nota:** um clone limpo não consegue gerar o cliente Prisma em ambientes sem
acesso a `binaries.prisma.sh`, e sem ele o `tsc --noEmit` do backend falha nos
imports do `@prisma/client`. Nesses casos, deixe o `docker compose build backend`
fazer a verificação.

---

## Convenções

### Português europeu

Interface, comentários e mensagens de erro. **Não** "saque", "você", "usuário",
"arquivo", "cadastro". Sim "retirada", "utilizador", "ficheiro", "registo".

Ainda há ocorrências por corrigir — nomeadamente nos painéis laterais do login e
do registo.

### Comentários explicam *porquê*, não *o quê*

Os bons comentários deste projeto registam a decisão e o problema que ela evita:
por que o IBAN é congelado, por que pendente não conta como pendência do
motorista, por que a rota `/reported` vem antes de `/:id`, por que o CSV tem
middleware próprio.

Um comentário que descreve o que a linha seguinte faz é ruído. Um que explica por
que ela existe poupa uma tarde a alguém.

### Commits

Conventional Commits, com corpo a explicar **o problema que existia**, não só a
mudança. Separados por assunto.

```
fix(analytics): passivo do painel passa a somar os fechos semanais

O "Devido aos motoristas" somava a tabela de ganhos, do tempo em que o
motorista lançava o proprio saldo. Os lancamentos passaram a ser conferencia
e nao creditam nada, por isso o numero inflava com valores que nao sao
divida e ignorava os fechos.
```

**Sem acentos nas mensagens de commit.** A codificação do terminal em Git Bash no
Windows troca-os por caracteres estranhos e ficam gravados assim no histórico.
Nos ficheiros de código mantém-se o português correto.

Duas notas de terreno: um `git add` com vários caminhos **aborta tudo** se um
deles não existir; e o editor por omissão é o Vim, que já prendeu alguém — sair é
`Esc`, `:q!`, Enter. Passar as mensagens em comando pronto a colar, com um `-m`
por parágrafo, evita as duas coisas.

### Antes de commitar

Passe os olhos pela lista de ficheiros do `git diff`. **Se aparecer algum que não
foi anunciado, pare.** Já houve uma sessão em que apareceram ficheiros alterados
que não correspondiam a nenhuma edição feita; foi apanhado a tempo porque a
comparação foi feita.

---

## Armadilhas conhecidas

**Nunca correr `npm audit fix --force`.** Ignora os intervalos semver e é capaz
de trocar o Vite ou o React por versões incompatíveis. As três vulnerabilidades
altas atuais são todas da cadeia `prisma → @prisma/config → deepmerge-ts`.
Verificar primeiro com `npm audit --omit=dev`.

**A pasta do projeto não se renomeia.** O nome do projeto Docker está fixo em
`dragonfleet` no Compose justamente para o proteger disso, mas mover a pasta com
contentores de pé confunde à mesma.

**Um `replace` que não encontra o texto não avisa.** Já deixou um componente sem
definição no meio de uma edição por script. Se editar ficheiros com ferramentas,
confirme o resultado com o typecheck.

**O `VITE_API_URL` é build time.** Mudá-lo obriga a reconstruir o frontend, sempre.
