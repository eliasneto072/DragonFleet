# DragonFleet — contexto para continuar

Cola este ficheiro no início de uma conversa nova.

**Atualizado a 8 de setembro de 2026.**

Este documento tem o que muda: estado atual, o que vem a seguir, e como se
trabalha. O que é estável — modelo de negócio, arquitetura, telas, publicação —
vive em [`docs/`](./docs/) e não se repete aqui.

- **Como funciona o negócio:** [docs/01-visao-geral.md](./docs/01-visao-geral.md)
- **As telas:** [docs/02](./docs/02-portal-do-motorista.md) e [docs/03](./docs/03-painel-de-administracao.md)
- **Stack e decisões:** [docs/04-arquitetura.md](./docs/04-arquitetura.md)
- **Publicação:** [docs/05-deploy.md](./docs/05-deploy.md)
- **Convenções:** [docs/06-desenvolvimento.md](./docs/06-desenvolvimento.md)

---

## 1. O essencial

Plataforma de gestão de frota TVDE em Portugal. **Não é um produto para
qualquer frota** — é o sistema de um operador concreto, o **Diogo**, e isso
explica quase todas as decisões.

| | |
|---|---|
| Repositório de trabalho | `github.com/eliasneto072/DragonFleet` (público) |
| Repositório do cliente | `github.com/chromaticdragontvde/DragonFleet` (privado) |
| Branch | `main` — um `git push` escreve nos dois |
| Pasta local | `C:\dev\DragonFleet` · Windows, Git Bash |
| Idioma | Português **europeu**, na interface e nos comentários |
| Autor | Elias Neto — Vértice (`eliasneto072.github.io/vertice`) |

**O deploy está feito e a funcionar.** Render para a API e a base, Cloudflare
Pages para o frontend. Fase atual: correções e funcionalidades novas pedidas
pelo cliente.

### Produção

| | |
|---|---|
| API | `https://dragonfleet-api.onrender.com` (Render, plano Starter, Frankfurt) |
| Base | `dragonfleet-db` (Render, Basic-256mb, Frankfurt) |
| Frontend | `https://dragonfleet.pages.dev` (Cloudflare Pages) |
| Ficheiros | Cloudinary |
| Email | Resend |
| Infraestrutura | descrita em [`render.yaml`](./render.yaml) |

Ambiente local a correr com Docker Compose, exposto ao cliente por um túnel
ngrok quando é preciso mostrar algo antes de publicar.

---

## 2. Estado verificado

Frontend e backend compilam. **77 testes de integração a passar**, em cinco
ficheiros. Os quatro contentores sobem.

### Concluído

**Publicação.** Render + Cloudflare Pages, com `render.yaml`, `_redirects` e
`_headers`. Documentação completa em `docs/`, com capturas e dois GIFs.

**Segurança.** CORS restrito, verificação de ambiente a rebentar antes de abrir
a porta, segredos com mínimo de 32 caracteres, `helmet`, limite de tentativas em
`/auth/login`, `/auth/refresh` e no registo público, `trust proxy` em 1.

**O bug do login.** Uma palavra-passe errada recarregava a página e esvaziava o
formulário. O `api-client` tratava qualquer 401 como token expirado, incluindo o
do próprio login, e caía num `window.location.href = '/login'` estando já em
`/login`. Corrigido com uma lista de rotas que não renovam.

**A marca.** Ícones refeitos: estavam a 1,88:1 de contraste e a 16px eram uma
mancha verde. O logótipo antigo do carro saiu da página de entrada. Cache dos
assets corrigida no nginx e no `_headers`.

**A página de entrada, reescrita.** Falava a um gestor à procura de software,
prometia métricas que não existem (corridas, avaliação, metas) e usava
documentos brasileiros. Agora fala ao motorista.

**Validade dos documentos — dois bugs.** O repositório descartava `issuedAt` e
`expiresAt` no `update`; o botão que os enviava estava escondido em documentos
já aprovados; e a leitura recuava um dia fora de UTC, além de dar por expirado
um documento no próprio dia da validade.

**Papéis de escritório.** O `MANAGER` existia no schema mas o `users.service`
exigia ADMIN em três métodos, o que o partia. Acrescentado o `SUPPORT`, com seis
funções de guarda partidas em `podeVer` e `podeGerir`. Tela de **Equipa** para
promover e despromover.

**O seed do administrador** movido para `src/scripts/`, para poder correr dentro
do contentor com `node dist/scripts/seed-admin.js`.

**A extensão** deixou de ter o endereço da API preso ao manifesto:
`optional_host_permissions` mais o cabeçalho `ngrok-skip-browser-warning`.

**Higiene.** Chave do Cloudinary rodada (tinha passado pelo Discord com o
segredo). Palavra-passe do administrador mudada (tinha ficado visível num ecrã
partilhado) e `SEED_ADMIN_PASSWORD` apagada do Render.

---

## 3. O que vem a seguir

Quatro pedidos do cliente, com as decisões dele já tomadas. **Nada disto está
começado.**

### Fase 1 · Quem esteve com o carro naquele dia

A `VehicleAssignment` já guarda `startedAt` e `endedAt` — os dados estão lá,
falta perguntá-los.

O cliente quer isto **sobretudo para investigar** multas e acidentes. Por isso
não é um filtro na lista da frota, que responderia "quem tem o carro agora": é
uma **consulta** por matrícula e data, que devolve quem estava atribuído naquele
dia, o período completo da atribuição e o contacto do motorista. Uma multa traz
matrícula e data, e é isso que se tem na mão.

Sem dependências novas.

### Fase 2 · Filtros nos documentos

Seletores de **motorista** e **matrícula** na tela de Documentos. O
`Document.vehicleId` já existe.

Ambos com busca ao escrever, e não uma lista aberta: com dois mil motoristas de
teste, um dropdown clássico é uma lista que ninguém percorre.

Sem dependências novas.

### Fase 3 · Exportar a Faturação

**`.xlsx` E PDF**, os dois, decidido pelo cliente.

O `.xlsx` precisa do **`exceljs`**, dependência nova. Uma folha por semana,
larguras de coluna, totais em negrito, valores como número e não como texto —
senão o Excel não os soma. Um separador de resumo por motorista.

O PDF reaproveita o `pdfkit`, que já lá está para o relatório financeiro, com a
marca do DragonFleet no cabeçalho.

Ambos respeitam os filtros aplicados na tela. Exportar tudo, com 88 mil fechos
na base, dá um ficheiro que ninguém abre.

**Um pormenor que vale mais do que parece:** o Excel português espera ponto e
vírgula como separador e vírgula decimal. Vale para qualquer CSV que se faça.

> **Esta fase está bloqueada até o npm ser atualizado.** Ver a secção 5.

### Fase 4 · Saldo depois de cada movimento

O cliente escolheu o **saldo real**: fechos, menos retiradas pagas, mais
ajustes, por ordem cronológica. Não é a soma dos fechos.

Obriga a juntar três tabelas e a acumular linha a linha. Só aparece **com um
motorista filtrado** — num extrato de toda a gente o número não quer dizer nada,
e a coluna fica escondida até haver filtro.

O rótulo tem de dizer o que aquele número é. Se não bater com o saldo que o
motorista vê no portal, gera precisamente os tickets que devia evitar. Os testes
têm de comparar a última linha contra a view `driver_balances`.

É a fase mais delicada, e é por isso que fica para o fim.

### Depois

Rever as exportações que já existem — o CSV dos Recibos Verdes e o PDF do
Financeiro — para uniformizar com o `exceljs` já presente. Pedido do cliente,
explicitamente para depois.

---

## 4. Dívida conhecida

Por ordem de importância.

1. **`GET /health` não existe.** Sem ela o `render.yaml` não define
   `healthCheckPath`, e o Render dá o serviço por vivo assim que a porta abre —
   um backend de pé com a base inacessível passa na mesma. Trabalho de minutos.
2. **O frontend não tem executor de testes.** Tentou-se acrescentar o `vitest` e
   partiu o build; ver a secção 5.
3. **Português do Brasil** nos painéis laterais do login e do registo. O login
   diz "dos seus motoristas" e o registo diz "Comece a gerir a sua frota hoje",
   com um selo "Grátis" — o mesmo engano de enquadramento que a página de
   entrada já não tem. Restam ocorrências de "saque", "você", "usuário",
   "arquivo" noutras telas.
4. **A extensão nunca foi testada contra um portal a sério.** O código está
   completo e os 15 testes de emparelhamento passam, mas os adaptadores procuram
   a tabela pelo texto dos cabeçalhos e ninguém verificou isso na Uber ou na
   Bolt. **O acesso é do cliente.** Precondição que vai morder: o emparelhamento
   é contra motoristas `DRIVER` e `ACTIVE`, e numa base sem eles a folha volta
   inteira como "não existe no DragonFleet".
5. **Os não emparelhados são mostrados e descartados.** Não há forma de dizer
   "este 'M. Antunes' do portal é a Mónica Antunes" e ficar guardado. Uma tabela
   de alias por motorista e plataforma resolvia; meia dúzia de horas.
6. **Ficheiros no Cloudinary com entrega pública.** O upload não define `type`,
   portanto é `upload`: qualquer pessoa com o URL abre o ficheiro. São recibos
   verdes e comprovativos bancários, com nome e IBAN. Hoje é como um vídeo não
   listado — não se descobre por acaso — mas um URL reencaminhado fica acessível
   para sempre. A correção é `type: 'authenticated'` com URLs assinados, e devia
   entrar antes de haver muitos motoristas reais.
7. **`COMPROVATIVO_IBAN` existe no enum e não é usado.** O comprovativo vive em
   `bank_accounts.pending_proof_url`, fora da tabela de documentos. Decidir: ou
   passa a `Document`, ganhando a tela de revisão que já existe, ou sai do enum.
8. **A importação de ganhos está na tela do motorista.** A decisão foi o
   contrário — o admin recebe os ficheiros e confere. Fica onde está até existir
   a receção do lado da administração.
9. **`withdrawalsService` vive em `features/driver/services/`** e é importado
   pelo Financeiro. Serviço partilhado alojado na feature errada.
10. **Código morto:** `shared/lib/mock-data.ts` e `shared/types/index.ts`.
    Ninguém os importa e contradizem a API real (`method: 'pix' | 'paypal'`).
11. **Três vulnerabilidades altas** do `npm audit`, todas na cadeia
    `prisma → @prisma/config → deepmerge-ts`. **Nunca `npm audit fix --force`.**
12. **`backend/modelo_dragon_fleet.jpeg`** é o diagrama ER com nome enganador e
    na pasta errada. Devia ser `docs/modelo-de-dados.jpeg`.
13. **Validação antes de autorização** em vários controllers: um corpo
    malformado leva 400 antes de a permissão ser verificada. Não é um buraco,
    mas obriga os testes de permissão a mandar corpos válidos.

---

## 5. Armadilhas do ambiente

Estas custaram tempo real. Leia antes de mexer.

### O Docker é o verificador de tipos a sério

O `prisma generate` não corre em ambientes sem acesso a `binaries.prisma.sh`.
Sem ele, o `tsc` vê o `@prisma/client` como vazio e **não valida nada contra o
schema** — 70 erros de base que não significam nada, e erros verdadeiros que
passam despercebidos.

Um teste que escrevia numa tabela sem os campos obrigatórios passou pelo `tsc`
local e só rebentou no `docker compose build`. **Se a alteração escreve na base,
o build do Docker é o primeiro sítio onde é verificada de verdade.**

Para saber se um erro é novo: comparar a contagem antes e depois. Eram 70 em
setembro de 2026.

### O npm 10.9.8 desta máquina não consegue instalar dependências

Qualquer alteração ao `package.json` sem regenerar o `package-lock.json` faz o
`npm ci` falhar com `Cannot read properties of null (reading 'edgesOut')` — e o
`npm install` que devia arranjar o lock falha com o mesmo erro. Isso parte o
build do Docker, porque o Dockerfile corre `npm ci`.

**A Fase 3 precisa do `exceljs` e está bloqueada por isto.** O próprio npm avisa
no output: `10.9.8 → 12.0.2`. Atualizar antes de tentar.

### Depois de mexer no schema, `npx prisma generate`

O cliente Prisma da máquina é gerado no `postinstall`. Uma migração que
acrescente um valor a um enum não o regenera, e o cliente antigo **recusa o
valor novo do lado do cliente**, antes de o pedido sair — com uma mensagem que
não aponta para a causa.

### A ordem certa ao testar

```bash
docker compose up -d --build     # contentores primeiro
npx prisma generate              # só se o schema mudou
npm run test:integration         # a suite por último
```

Correr a suite enquanto os contentores reiniciam dá
`Can't reach database server at localhost:5434` em testes que não têm nada de
errado.

### `NODE_ENV` vem do `.env` da RAIZ

O `docker-compose.yml` usa `${NODE_ENV:-development}`, e o Compose lê o `.env`
da raiz do projeto — não o `backend/.env`. Um `NODE_ENV=production` esquecido
lá faz o backend local recusar arrancar por falta de `CORS_ORIGINS`, em ciclo de
reinício.

Em desenvolvimento, `CORS_ORIGINS` **vazio** é o correto: lista vazia significa
aceitar qualquer origem.

### Windows e Git Bash

**Sem acentos nas mensagens de commit** — a codificação do terminal troca-os e
ficam gravados assim. Nos ficheiros de código mantém-se o português correto.

Um `git add` com vários caminhos **aborta tudo** se um deles não existir. O
editor por omissão é o Vim (`Esc`, `:q!`, Enter). Passar as mensagens em comando
pronto a colar, com um `-m` por parágrafo, evita as duas coisas.

A pasta do projeto não se renomeia com contentores de pé.

---

## 6. Decisões fechadas — não voltar a debater

**A comissão incide sobre o lucro**, não sobre o bruto. Os lançamentos do
motorista são conferência e **não creditam**. O fecho semanal é o único momento
em que o saldo sobe. Saldo negativo é permitido; pedir acima do disponível não
é. A percentagem, o IBAN e o recibo **congelam** depois do facto. Detalhe em
[docs/01](./docs/01-visao-geral.md).

**O registo é público e a conta nasce ativa, com papel `DRIVER` fixado no
servidor.** Quem não pertence à frota é desativado na tela de Motoristas. Contas
de escritório fazem-se **promovendo** uma conta existente na tela de Equipa —
não há criação de contas com papel.

**Os três papéis de escritório:**

| Papel | O que faz |
|---|---|
| `ADMIN` | Tudo, incluindo Configurações, Sociedades, relatório financeiro e papéis |
| `MANAGER` | O dia a dia: documentos, fechos, retiradas, IBANs, viaturas, notificações, suporte, lista de motoristas |
| `SUPPORT` | **Vê** motoristas, documentos, retiradas, fechos, lançamentos e saldos. **Escreve** só em tickets. IBANs mascarados, só os últimos quatro dígitos |

**Ninguém muda o próprio papel**, e o **último ADMIN ativo** não pode ser
despromovido, desativado nem apagado.

**O IBAN vive no Perfil do motorista**, não em Documentos. O admin aprova no
Financeiro, ao lado de onde o dinheiro sai.

**A extensão de browser é a via principal** para a recolha Uber/Bolt; o CSV é a
secundária. Ela **não cria fechos** — cria lançamentos pendentes que aparecem em
Faturação › Por confirmar. O fecho continua a ser um ato do administrador.

**O endereço da API na extensão não vive no manifesto.** Usa
`optional_host_permissions` e o Chrome pede autorização para o endereço que a
pessoa escrever.

---

## 7. Como trabalhamos

### Debater antes de implementar

Sobretudo quando envolve dinheiro. Opções com prós e contras, uma recomendação,
e esperar a decisão. Quando o utilizador delega, decidir e **registar a decisão
e a razão** — no código e aqui.

Antes de propor, **ir ver o código**. Várias das melhores correções desta série
vieram de descobrir que o problema não era o que parecia: a validade não era
interface, era o repositório; o `MANAGER` não faltava, estava meio ligado.

### Entrega

**Ficheiros inteiros, num zip com a estrutura do projeto, mais um `aplicar.sh`.**
Nunca fragmentos com "adicione aqui" — substituição manual esquece sempre um.

```bash
bash /c/dev/_patch/<pacote>/aplicar.sh /c/dev/DragonFleet
```

O `aplicar.sh` só copia. **Nunca apaga** — se algo tem de sair, imprime o
comando no fim para a pessoa decidir.

Verificar antes de empacotar: `npm run typecheck` e `npm run build` no frontend,
`npx tsc --noEmit` no backend. E dizer com honestidade **o que não foi
verificado** — os testes de integração não correm sem Postgres nem cliente
Prisma gerado, e isso tem de ser dito, não escondido.

### Contabilidade dos ficheiros

Antes de empacotar, conseguir apontar a edição que produziu cada ficheiro. Do
outro lado, passar os olhos pelo `git diff` antes de commitar: **se aparecer
algum que não foi anunciado, parar.**

Um `replace` que não encontra o texto não avisa. Se editar por script, confirmar
o resultado com o typecheck.

### Commits

Conventional Commits, com o corpo a explicar **o problema que existia**, não só
a mudança. Separados por assunto. Sem acentos. Entregues em comando pronto a
colar, com um `-m` por parágrafo.

O corpo é a documentação das decisões deste projeto. Daqui a seis meses, alguém
que leia o histórico tem de perceber porque uma linha existe.

Quando algo não foi testado, **escrevê-lo no commit**. A extensão tem isso: "não
testado contra os portais da Uber e da Bolt".

### Testes

Quando a mudança mexe em permissões ou em dinheiro, **os testes são metade do
trabalho** e verificam sobretudo **recusas**. Um teste de permissão tem de
mandar um corpo válido — senão o 400 do Zod chega antes do 403 e o teste prova
que o corpo estava malformado, não que a autorização funciona.

Ler **a base de dados**, não a resposta da API. O bug da validade dava resposta
certa e base errada.

Testes de data **fixam o fuso**. O bug de um dia passava em Lisboa e falhava em
Campina Grande; sem fixar o fuso, o teste passava na máquina errada.

### Assumir os enganos

Aconteceram vários nesta série: corrigir um método e esquecer dois no mesmo
ficheiro; escrever um teste sem os campos obrigatórios; mexer no `package.json`
sem regenerar o lock e depois culpar o ambiente. Nomear o engano, explicar o que
o deixou passar, e corrigir a causa — não só o sintoma.

### Comentários explicam *porquê*

Os bons comentários deste projeto registam a decisão e o problema que ela evita.
Um comentário que descreve o que a linha seguinte faz é ruído; um que explica
por que ela existe poupa uma tarde a alguém.

---

## 8. A fonte fiável

O **GitHub**, desde que não haja alterações locais por commitar. Se houver,
pedir para commitar primeiro, ou pedir o zip da pasta.

**Nunca pedir um zip da pasta de trabalho para partilhar com terceiros:** o
`.gitignore` protege o `backend/.env` no Git, mas um zip da pasta leva-o com os
segredos dentro.
