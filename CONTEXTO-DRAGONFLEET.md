# DragonFleet — contexto para continuar

Cola este ficheiro no início de uma conversa nova. Contém tudo o que é preciso
para retomar sem repetir decisões.

Atualizado a 21 de agosto de 2026, depois de uma auditoria ao repositório.

---

## 1. O projeto

Plataforma de gestão de frota TVDE em Portugal. Cliente: **Diogo**.
Repositório: `github.com/eliasneto072/DragonFleet`
Branch de trabalho: **`feature/weekly-settlement`**
Pasta local: `C:\dev\DragonFleet`

**Stack:** React 18 + TypeScript + TailwindCSS v4 + shadcn/ui no frontend.
Node + Express + Prisma + PostgreSQL no backend. Docker Compose.
Idioma da interface e dos comentários: **português europeu**.

Ambiente: Windows, Git Bash. Nome do projeto Docker fixo em `dragonfleet`.

---

## 2. O modelo de negócio — leia isto primeiro

Estas decisões foram tomadas em reunião com o cliente e **não devem ser
revertidas sem o consultar**.

### O dinheiro tem uma porta só: o fecho semanal

O administrador regista, por semana e por motorista, o que entrou em cada
plataforma (Uber, Bolt) e o que saiu em despesas (Via Verde, combustível,
encargo da viatura, outros). A percentagem da empresa incide sobre o **lucro**
— receitas menos despesas — e não sobre o bruto. O líquido é creditado.

Fórmula, nas palavras do cliente: *"motorista fez 100€ Uber e 100€ Bolt, isso
dá 200€; gastou 50€ em gasóleo e 50€ em via verde, o resultado é 100€; a
percentagem vai ser sobre os 100€ de lucro e não dos 200€"*.

### Os lançamentos do motorista NÃO creditam

O motorista pode comunicar valores ("Registar ganho"), mas isso é
**conferência**, não depósito. O admin confirma ou recusa; confirmar significa
"confere com o que vou fechar". O saldo só sobe quando a semana fecha.

Se ambos creditassem, a semana seria paga duas vezes.

### Saldo negativo é permitido

Um motorista cujas despesas superem os ganhos fica a dever, e o valor é
descontado dos fechos seguintes. Houve guardas a impedir isto — foram removidas
de propósito.

O que **não** é permitido: pedir retirada acima do disponível.

### Valores congelados

Cada fecho grava a percentagem aplicada. Cada retirada aprovada grava o IBAN de
destino. Recibo não muda depois de emitido: alterar a configuração global não
pode reescrever contas já pagas.

---

## 3. Estado verificado do repositório

Últimos commits em `origin/feature/weekly-settlement`:

```
a3e4569  fix(earnings): a importacao de CSV rejeitava todos os CSV
9bc028e  fix(frontend): corrigir os erros de tipos que o build nunca viu
d923424  build(frontend): verificar tipos no build e fixar as dependencias
bbb6b48  feat(bank): dados bancarios com aprovacao e recibo na retirada
```

Verificado a partir de um clone novo: **frontend e backend compilam ambos sem
erros**.

### Já feito

- Fecho semanal completo: schema, backend, formulário do admin, lista com
  filtros, detalhe, cancelamento com estorno
- Painel do motorista reconstruído sobre fechos (gráfico semanal, detalhe por
  semana)
- Painel do admin como fila de trabalho (8 tipos de pendência)
- Tela de revisão de lançamentos (aba na Faturação)
- Redesenho das 7 telas do admin: skeleton, modo escuro, responsividade
- Validade de documentos preenchida pela administração ao rever
- Histórico de veículos na ficha do motorista
- Marca nova (logo do dragão), favicon, metadados
- View `driver_balances` unificando a fórmula do saldo
- Comissão vinda das Configurações em todos os cálculos, incluindo o PDF
- **Backend completo do IBAN e do recibo** (ver secção 4)
- **Typecheck no build do frontend** e instalação reprodutível (ver secção 6)
- **Importação de CSV desbloqueada** (ver secção 5)

---

## 4. Em curso — IBAN e recibo, interrompido a meio

O cliente pediu três coisas:

1. **Recibo verde obrigatório** no pedido de retirada
2. **IBAN no perfil do motorista**, com comprovativo, sujeito a aprovação
3. **IBAN visível no Financeiro** para o admin transferir

### Backend: pronto e publicado

- `schema.prisma` com `BankAccount`, `receiptUrl`/`receiptKey` na retirada,
  `paidToIban`/`paidToHolder`, e o tipo `COMPROVATIVO_IBAN`
- Base de dados resetada do zero; duas migrações: `init` e
  `add_driver_balances_view`. Confirmado que as migrações cobrem o schema — não
  há deriva
- Módulo `backend/src/modules/bank/` completo, com `/bank` registado em
  `routes/routes.ts`. Endpoints: submeter (motorista), `GET /bank/pending`
  (admin, já traz o comprovativo), aprovar e recusar
- `POST /withdrawals` exige `upload.single('receipt')` **e** um IBAN aprovado,
  respondendo `BANK_ACCOUNT_REQUIRED` quando falta
- IBAN congelado na aprovação da retirada

### Frontend: não existe nada

Nem serviço, nem tela, nem tipos. Consequência directa e **é o P0 número 1**:

> **Nenhum motorista consegue pedir uma retirada hoje.** O
> `features/driver/services/withdrawals.service.ts` continua a fazer
> `apiClient.post('/withdrawals', { amount })` em JSON contra uma rota que
> agora espera multipart com `receipt`. Todos os pedidos levam 400.

Isto **força a ordem do trabalho**: não dá para começar pelo recibo, porque
mesmo com o recibo anexado o pedido é recusado enquanto não houver IBAN
aprovado — e não há tela nenhuma onde o motorista submeta o IBAN nem onde o
admin o aprove. A sequência é: IBAN do motorista → aprovação no admin → recibo
no pedido → Financeiro.

### Decisões de desenho já tomadas

O utilizador confirmou o primeiro ponto e delegou os restantes ("faça do jeito
que achar melhor, leve em consideração o que for mais profissional e
escalável"). Ficaram assim:

- **O IBAN vive no `ProfilePage` do motorista**, numa secção "Dados bancários",
  mostrando os quatro estados que o backend distingue: sem IBAN, pendente (com
  o em vigor e o submetido lado a lado), recusado com motivo, e em vigor. Não
  na tela de Documentos, que ficaria a misturar cartão de cidadão com meio de
  pagamento.
- **O admin aprova no Financeiro**, em aba própria — ao lado de onde o dinheiro
  sai e do IBAN que ele vai copiar para o banco.
- **O botão "Nova Retirada" fica desativado** quando não há IBAN aprovado, com
  aviso e atalho para o Perfil. Deixar o motorista preencher o valor e anexar o
  recibo para depois recusar é a pior versão disto.
- **O saldo disponível passa a aparecer na tela de retiradas.** Hoje o motorista
  escolhe o valor às cegas e leva `INSUFFICIENT_BALANCE`. A mesma consulta que
  diz "tem IBAN" pode trazer o disponível.

### Uma decisão de arquitetura por aplicar

O `api-client.ts` força `Content-Type: application/json`, por isso cada tela de
upload nasceu com o seu próprio `fetch` cru (ver `documents.service.ts` e
`earnings-import.service.ts`). Esses fetch repetem o token e o tratamento de
erro, e **nenhum passa pela renovação silenciosa da sessão** — token expirado
durante um upload dá 401 em vez de renovar.

A correção certa é o `request()` detetar `FormData` e omitir o Content-Type
(o browser tem de o definir para incluir o *boundary*), expondo um
`apiClient.upload(path, form)`. Assim o IBAN e o recibo nascem certos em vez de
repetirem o padrão.

### Falta ainda

- Frontend do IBAN: formulário no perfil, aprovação no admin
- Frontend do recibo: anexo no pedido de retirada
- Financeiro: mostrar IBAN, botão copiar, botão "marcar como paga"
- Seed para popular a base com cenários de teste
- Testes automatizados (o utilizador quer aprender a fazê-los "como uma empresa
  faz")

---

## 5. Auditoria priorizada

Feita em agosto de 2026 sobre o código publicado. Os itens riscados já foram
corrigidos e estão no repositório.

### P0 — parte alguma coisa hoje

1. **Nenhum motorista consegue pedir retirada.** Ver secção 4. É o próximo
   trabalho.
2. ~~A importação de CSV rejeitava todos os CSV.~~ **Corrigido** em `a3e4569`.
3. **Não há como marcar uma retirada como paga.** O Financeiro só tem Aprovar e
   Rejeitar; nada no frontend emite `PAID`. Duas consequências: o indicador
   "Pago este mês" filtra `status = PAID` no `analytics.repository` e por isso
   é sempre 0 €; e não há registo de que a transferência saiu do banco — uma
   retirada aprovada e uma já transferida são indistinguíveis.

### P1 — a rede de segurança

4. ~~O frontend não tinha TypeScript nem typecheck no build.~~ **Corrigido** em
   `d923424`. Agora `npm run typecheck` (`tsc -b`) existe e o build é
   `tsc -b && vite build`. A primeira passagem apanhou 26 erros, 4 deles bugs a
   sério, corrigidos em `9bc028e`.
5. ~~O build do frontend não era reprodutível.~~ **Corrigido**: o Dockerfile
   copiava `pnpm-lock.yaml*`, ficheiro que nunca existiu, e caía no
   `npm install`. Passou a `npm ci` com o `package-lock.json`. O `react` e o
   `react-dom` nem sequer estavam declarados — chegavam como dependência
   transitiva, com `@types/react` 19 sobre um React 18 em execução.
6. ~~`ApiWithdrawal` sem os campos do recibo.~~ Entra no trabalho do IBAN.

### P2 — em desacordo com as decisões

7. **A importação de ganhos vive no painel do motorista** (`ImportEarnings` no
   `DriverDashboardPage`). A decisão foi o contrário: o admin recebe os
   ficheiros dos portais e confere. Combinado deixar onde está até
   construirmos a receção do admin a sério — nessa altura sai de vez.
8. **`COMPROVATIVO_IBAN` existe na base e não é usado.** O comprovativo vive em
   `bank_accounts.pending_proof_url`, fora da tabela de documentos. Decidir: ou
   passa a ser `Document`, ganhando a tela de revisão que já existe, ou o valor
   sai do enum.
9. **Português do Brasil nas telas.** 28 ocorrências de "saque", "você",
   "usuário", "arquivo". A pior é a tela de retiradas: título "Retiradas",
   subtítulo "Solicite saques e acompanhe seu histórico", toast "Solicitação de
   saque enviada!".
10. **O motorista pede às cegas** — sem saldo visível. Entra no trabalho do
    IBAN (secção 4).
11. **O Financeiro importa `withdrawalsService` de `features/driver/services/`.**
    Serviço partilhado alojado na feature errada.

### P3 — limpeza

12. `shared/lib/mock-data.ts` (186 linhas) e `shared/types/index.ts` (162)
    estão mortos — ninguém os importa. Pior: contêm modelos que contradizem a
    API real (`method: 'pix' | 'paypal'`, estados em minúsculas). Apagar antes
    que alguém os importe por engano.
13. Fila do painel por tipo; a versão por pessoa foi entregue e nunca aplicada.
14. ~~CRLF a poluir o `git status`.~~ **Não existe do lado do utilizador** — o
    Git dele tem `core.autocrlf=true` e normaliza sozinho. Era artefacto do
    ambiente de análise.
15. 10 vulnerabilidades do `npm audit` por tratar. **Nunca correr
    `npm audit fix --force`** — ignora os intervalos semver e é capaz de trocar
    o Vite ou o React por versões incompatíveis. Fazer como assunto próprio,
    com typecheck e build a confirmar antes e depois. Verificar primeiro
    `npm audit --omit=dev`, que mostra só o que chega a produção.

### Dívida resolvida

- `FINANCIAL_FALLBACK` já está a zeros e o `useSettings` lê do servidor.

---

## 6. Automatização Uber/Bolt

O cliente não conseguiu acesso à API. Decidido: **extensão de browser** que lê
a página que ele já tem aberta nos portais e envia para o DragonFleet.

**A extensão é a via principal. O CSV é a secundária** — serve de alternativa
quando a extensão falhar ou o portal mudar de aspeto, para carregar semanas
antigas, e para testar a receção enquanto a extensão não existe. O utilizador
avisou que **não garante que os portais tenham botão de download**.

Nota de vocabulário: a extensão automatiza a **recolha dos valores das
plataformas**, não o fecho semanal. O fecho continua a ser um ato do
administrador, que confirma o que entrou e lança as despesas. O que a extensão
elimina é a transcrição manual.

Ordem acordada: **primeiro a receção e a tela de conferência no DragonFleet, a
extensão depois.** A tela de conferência é a mesma porta de entrada para as
duas origens.

O que se sabe dos portais:
- Uber: coluna "Rendimentos líquidos", nomes completos
- Bolt: coluna "Net earnings", idem
- Uber escreve "Monica Luis", Bolt escreve "Mónica Luis" — **normalizar acentos
  ao casar nomes**

### Risco concreto no parser, por confirmar com ficheiros reais

O `csv-parser.ts` casa cabeçalhos por lista de aliases: primeiro por igualdade
exata, depois por inclusão. A coluna da Uber **é apanhada** — "Rendimentos
líquidos" contém "rendimento", que está na lista — portanto o alarme que dei
antes estava errado.

**Mas há um perigo real:** se o ficheiro da Uber tiver também uma coluna de
bruto do género "Rendimentos brutos", a busca por inclusão devolve a **primeira
coluna** que contenha "rendimento". Se o bruto vier primeiro, importa-se o
bruto em vez do líquido, em silêncio, e o fecho fica inflado.

Corrigir isto exige ver um ficheiro real — qualquer alias acrescentado às cegas
é palpite. **Pedido ao cliente, ainda sem resposta: exportar um CSV de cada
portal.** É a primeira coisa a fazer quando chegarem.

### Decisão que vai ser precisa na extensão

Ler a página pelo DOM (frágil: a Uber muda o layout e parte) ou usar o botão de
download do portal e enviar o ficheiro (mais robusto, mas obriga a um clique e
pode não existir). Deixado para o seu tempo.

---

## 7. Como trabalhamos

### Ficheiros completos, sempre — entregues como pacote

Entregar **ficheiros inteiros**, nunca fragmentos com "adicione aqui".

O método que funciona: preparar os ficheiros, empacotá-los num zip com a
**mesma estrutura de pastas do projeto**, e incluir um `aplicar.sh` que copia
tudo para o sítio certo. O utilizador corre:

```bash
bash /c/dev/_patch/<pacote>/aplicar.sh /c/dev/DragonFleet
```

O script deve validar que o destino é mesmo a raiz do projeto antes de
escrever, imprimir cada ficheiro que copiou (`cp -v`), e no fim lembrar de
conferir com `git status --short`. Substituição manual ficheiro a ficheiro
esquece sempre um — já aconteceu com o `ts.config.json`.

Ficheiros que mudam de nome ou que o Windows não deixa criar (os que começam
por ponto) vão no pacote com nome neutro e são renomeados pelo script ou à mão,
com instrução explícita.

### Verificar antes de entregar

O frontend agora tem rede de segurança. **Correr sempre antes de empacotar:**

```bash
cd frontend && npm run typecheck    # tsc -b
cd backend  && npx tsc --noEmit
```

Continua a valer para edições por script:
- Chavetas e parênteses balanceados
- Variáveis declaradas antes do uso (React rebenta com `Cannot access before
  initialization`)
- Funções chamadas existem de facto (um `replace` que não encontra o texto
  **não avisa** — já deixou um `<FleetSkeleton />` sem definição)
- Em `Promise.all`, o número de variáveis no destructuring bate com o número de
  consultas

**E uma regra nova, depois de um incidente:** antes de empacotar, comparar a
cópia de trabalho inteira contra a origem e **conseguir apontar a edição que
produziu cada ficheiro alterado**. Numa sessão apareceram na cópia de trabalho
ficheiros novos e alterações que não correspondiam a nenhuma edição feita — foi
apanhado a tempo e nada chegou ao repositório, mas só porque a comparação foi
feita. O que não se consegue explicar, não sai.

Do lado do utilizador, a contrapartida: **passar os olhos pela lista de
ficheiros do `git diff` antes de commitar**. Se aparecer algum que não foi
anunciado, parar.

### Onde está a fonte fiável

O repositório no GitHub, desde que **não haja alterações locais por commitar**.
Já aconteceu uma correção ser desfeita por se ter partido da versão publicada
quando havia trabalho local. Se houver, pedir para commitar primeiro — ou pedir
o zip da pasta.

**Nota técnica:** um clone limpo não consegue gerar o cliente Prisma neste
ambiente (`binaries.prisma.sh` está bloqueado), e sem ele o `tsc --noEmit` do
backend falha nos imports do `@prisma/client`. Solução usada: reaproveitar o
`node_modules/.prisma` de um zip do projeto, **depois de confirmar que o
`schema.prisma` do zip é idêntico ao do repositório**. Em alternativa, deixar o
`docker compose build backend` fazer a verificação.

### Commits

Conventional Commits, com corpo a explicar **o problema que existia**, não só a
mudança. Separar por assunto.

Fornecer sempre a mensagem **em comando pronto a colar, com `-m` repetido** —
um `-m` por parágrafo. O utilizador está em Git Bash no Windows e o editor por
omissão é o Vim, que já o prendeu uma vez (sair: `Esc`, `:q!`, Enter). Duas
notas mais:

- **Sem acentos nas mensagens de commit.** A codificação do terminal troca-os
  por caracteres estranhos e ficam gravados assim no histórico. Nos ficheiros
  de código mantém-se o português correto.
- Um `git add` com vários caminhos **aborta tudo** se um deles não existir.

Exemplo do formato esperado:

```
fix(analytics): passivo do painel passa a somar os fechos semanais

O "Devido aos motoristas" somava a tabela de ganhos, do tempo em que o
motorista lançava o próprio saldo. Os lançamentos passaram a ser conferência
e não creditam nada, por isso o número inflava com valores que não são
dívida e ignorava os fechos.
```

### Comentários no código

Explicar **por que**, não o que. Os bons comentários deste projeto registam a
decisão e o problema que ela evita — por que o IBAN é congelado, por que
pendente não conta como pendência do motorista, por que a rota `/reported` vem
antes de `/:id`, por que o CSV tem middleware próprio.

### Debater antes de implementar

O utilizador prefere discutir o desenho antes do código, sobretudo quando
envolve dinheiro. Apresentar opções com prós e contras, recomendar uma, e
esperar a decisão. Quando ele delega ("faça como achar melhor"), decidir e
**registar a decisão e a razão** — no código e aqui.

### Docker

```bash
docker compose up -d --build               # tudo
docker compose build --no-cache frontend   # frontend puro (o Vite embute
                                           # variáveis em build time)
docker compose build backend               # backend puro
```

Se o build ficar preso a instalar pacotes, é o `npm ci` — normal, uns minutos.

Criar o admin:

```bash
docker compose exec -e SEED_ADMIN_EMAIL=admin@dragonfleet.com \
  -e SEED_ADMIN_PASSWORD=umaSenhaForte123 backend \
  npx -y tsx prisma/seed-admin.ts
```

---

## 8. Primeiro passo na conversa nova

1. Clonar ou puxar `feature/weekly-settlement` e confirmar que compila:
   `cd frontend && npm ci && npm run typecheck`
2. Retomar pelo **P0 número 1**: o IBAN no `ProfilePage`, seguido da aprovação
   no Financeiro, do recibo no pedido de retirada e do saldo visível. As
   decisões de desenho estão fechadas na secção 4 — não é preciso voltar a
   debatê-las.
3. Aproveitar para incluir o `apiClient.upload()` com suporte a `FormData`,
   para o IBAN e o recibo não repetirem o padrão dos fetch crus.
4. A seguir, o P0 número 3: "marcar como paga" no Financeiro.
