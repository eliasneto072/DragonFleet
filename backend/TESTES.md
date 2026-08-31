# Testes — DragonFleet

Como este projeto é testado, porquê assim, e como acrescentar testes novos.

```bash
cd backend
npm test                  # unitários — rápidos, sem base de dados
npm run test:watch        # fica a correr enquanto se programa
npm run test:coverage     # relatório de cobertura

# Integração — precisa do Postgres de testes de pé:
docker compose up -d postgres-test
npm run test:integration

npm run test:all          # os dois
```

**Pré-requisito:** o `prisma generate` tem de ter corrido. Os enums do domínio
(`EarningPlatform`, `WithdrawalStatus`, …) são reexportados do cliente gerado, e
sem ele os ficheiros que os importam falham em tempo de execução. O `npm ci`
corre-o automaticamente no `postinstall`.

---

## A pirâmide

Quatro camadas, de baixo para cima, por custo e por velocidade. A regra é ter
muitos testes em baixo e poucos em cima — o inverso dá uma suite lenta que
ninguém corre.

### 1. Unitários — funções puras, sem base de dados

**É onde estamos.** 75 testes, correm em menos de um segundo.

| Ficheiro | O que protege |
|---|---|
| `settlements.types.test.ts` | a fórmula do fecho: receitas, despesas, imposto, comissão |
| `csv-parser.test.ts` | a leitura dos extratos da Uber e da Bolt |
| `shared/utils/iban.test.ts` | a validação de IBAN pelo resto 97 |
| `name-matching.test.ts` | casar o nome do portal com o motorista da base |
| `shared/utils/week.test.ts` | semanas de fecho, com os períodos reais dos portais |

Entra um valor, sai outro. Sem rede, sem base de dados, sem relógio. Nunca
falham por razões que não sejam o código estar errado, e por isso são as que se
escrevem primeiro.

### 2. Integração — com Postgres a sério

`src/test/money-rules.integration.test.ts` e `ingest.integration.test.ts`. O pedido entra pelo Express, passa
pela autenticação, pelo zod, pelo service e pelo Prisma, e chega ao Postgres.
Nada é substituído por imitações — é por isso que estes apanham uma coluna que
falta numa migração ou um middleware de permissões esquecido.

As regras protegidas:

- o lançamento comunicado pelo motorista **não** credita saldo (nem aprovado)
- só o fecho **registado** credita; um rascunho não
- o saldo pode ficar **negativo**
- retirada acima do disponível é recusada
- sem recibo dá `MISSING_RECEIPT`
- sem IBAN aprovado dá `BANK_ACCOUNT_REQUIRED` — uma conta só pendente não serve
- o IBAN **congela** na aprovação e não muda quando o motorista troca de conta
- a comissão e o imposto **congelam** no fecho
- não se paga o que não foi aprovado
- um motorista não vê os dados bancários nem o saldo de outro, nem aprova a
  própria retirada

**Isolamento:** cada teste começa com a base vazia. O `TRUNCATE` corre *antes*
de cada caso, não depois — se um teste rebentar a meio, o seguinte arranca limpo
em vez de herdar os destroços. A lista de tabelas vem do catálogo do Postgres,
portanto uma tabela nova passa a ser limpa sozinha.

Não se usa transação-revertida-no-fim, que seria mais rápida: o
`settlements.service` abre as suas próprias transações com `$transaction`, e
encaixá-las faria os testes exercitar um caminho que a produção nunca percorre.

**Proteção:** o harness recusa arrancar contra uma base cujo nome não termine em
`_test`. Estes testes apagam tabelas inteiras; um `.env` copiado da produção ou
um terminal na janela errada não devem chegar para perder dados.

**Em série, não em paralelo:** partilham uma base e cada um limpa-a ao começar.
Em paralelo, um apagaria as tabelas debaixo de outro a meio.

**A mesma base dos dois lados.** O `setup-env.ts` define o `DATABASE_URL` antes
de a aplicação ser carregada, porque o `config/prisma.ts` constrói o cliente no
momento em que é importado. Sem isso, as fábricas escrevem numa base e a
aplicação lê de outra.

Foi assim que esta suite falhou na primeira execução. Doze testes deram 404 — e
seis **passaram**, os que verificavam que nada tinha mudado ou que aceitavam
qualquer erro. Passar pela razão errada é o pior modo de falha de uma suite: dá
confiança sem dar cobertura.

Duas lições ficaram no código. O primeiro teste do ficheiro é uma verificação de
sanidade que falha alto se as duas metades se desencontrarem. E as asserções
passaram a ser exatas: `toBe(403)` e não `toBeGreaterThanOrEqual(403)`, porque
um 404 satisfazia o segundo e dizia "não encontrei" onde o teste lia "recusado".

### 3. Componente, no frontend *(por fazer)*

Vitest + Testing Library + MSW, que finge a API ao nível da rede em vez de se
fingirem os serviços. Alvos: o botão de retirada desativado sem IBAN, os quatro
estados bancários, o recibo obrigatório.

### 4. Ponta a ponta *(por fazer)*

Playwright, **um ou dois caminhos apenas**. São caros de manter; cobre-se o
caminho do dinheiro e mais nada.

---

## As convenções deste projeto

**O ficheiro de teste fica ao lado do que testa.** `computeTotals` vive em
`settlements.types.ts`, o teste em `settlements.types.test.ts`, na mesma pasta.
Uma árvore paralela obriga a manter duas estruturas em sincronia e esconde as
ausências.

**O nome do teste é a regra de negócio, escrita por extenso.**

```ts
it('recusa cobrar comissao sobre uma semana em prejuizo', ...)   // sim
it('testa computeTotals com valores negativos', ...)             // não
```

Quando um teste falha, o nome dele deve chegar para saber o que se partiu.

**Arranjar → Agir → Verificar.** Preparar, chamar uma vez, afirmar. Um teste com
um `if` lá dentro pode passar sem ter verificado nada.

**Construtores em vez de repetição.** O `semana()` no teste do fecho deixa cada
caso declarar só o que lhe importa. Quando a fórmula ganhar um campo, muda-se
num sítio e não em vinte.

**Uma regra por teste.** Vários `expect` sobre o mesmo resultado tudo bem; duas
regras diferentes no mesmo `it` não — quando falha, não se sabe qual delas.

**Tempo congelado.** O fuso está fixo em UTC na configuração. Um teste que
depende da hora a que corre falha ao domingo e ninguém percebe porquê.

**Cada teste constrói os seus dados.** O `seed-demo.ts` é para exploração
manual, **não** para os testes se apoiarem nele. Testes que partilham dados
ganham dependências invisíveis entre si e passam a depender da ordem de
execução.

**Cobertura é diagnóstico, não meta.** Não há limiar mínimo configurado de
propósito. Um número obrigatório leva a escrever testes que percorrem código sem
afirmar nada, e isso é pior do que não ter teste — dá a sensação de estar
coberto.

---

## A prática que mais rende

**Cada bug ganha primeiro um teste que o reproduz, e só depois a correção.**

Foi assim que se encontrou o bug do CSV. O commit `a3e4569` tinha corrigido a
importação para preferir o valor líquido ao bruto — mas só no caso inglês
(`Fare` vs `Net Earnings`). Ao escrever o teste de regressão com cabeçalhos
portugueses, ele falhou:

```
Data,Rendimentos brutos,Rendimentos líquidos
2026-03-15,250.00,187.50
```

O alias genérico `rendimento` casava com **as duas** colunas e ficava pela
primeira — a bruta. Importava 250 € onde o motorista tinha recebido 187,50 €,
33% a mais, semana após semana, no português que é o que os motoristas usam.

O teste é a razão de o bug ter aparecido. Sem ele, continuaria lá.

---

## Acrescentar um teste

1. Criar `<ficheiro>.test.ts` ao lado do código
2. `import { describe, it, expect } from 'vitest'` — não há globais neste projeto
3. Nomear o `it` com a regra, não com a função
4. `npm run test:watch` enquanto se escreve

Se a coisa a testar precisar de base de dados, de rede ou da hora atual, é sinal
de que a lógica está misturada com infraestrutura. Extrair a parte pura para um
ficheiro sem dependências — foi o que se fez com o `isValidIban`, que vivia
dentro do `bank.service.ts` e por isso exigia levantar uma base de dados para
verificar aritmética de strings.

---

## Integração contínua

`.github/workflows/ci.yml` corre a cada push: tipos e testes no backend, tipos e
build no frontend. Testes que só correm quando alguém se lembra acabam por
deixar de correr.
