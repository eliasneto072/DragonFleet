# Extensão de recolha — DragonFleet

Lê as tabelas de quatro portais e envia-as para o DragonFleet:

- **Uber e Bolt** — os ganhos de cada motorista, para conferência no fecho.
- **Prio e Via Verde** — o combustível e as portagens, que o fecho desconta.

## Instalar

1. Chrome ou Edge → `chrome://extensions`
2. Ligar **Modo de programador**
3. **Carregar expandida** → escolher esta pasta

## Usar

1. Abrir o portal e **escolher o período no seletor de datas**, de segunda a domingo
2. Clicar no ícone da extensão
3. Entrar com a conta de administrador, à primeira vez
4. Conferir o que aparece — e sobretudo **quem ficou por emparelhar**
5. **Enviar**

## O endereço da API

É um campo, não uma constante no código. Escreve-se conforme onde a API está:

| Onde | O que escrever |
|---|---|
| Docker local | `http://localhost:3000` |
| Túnel do ngrok | `https://<subdominio>.ngrok-free.dev/api` |
| Render | `https://<servico>.onrender.com` |
| Domínio próprio | conforme a configuração |

**Atrás de um nginx, o endereço termina em `/api`.** É o nginx que encaminha
`/api/` para o backend e retira o prefixo. Sem o sufixo, os pedidos batem no
frontend e voltam com HTML — a extensão diz isso por palavras, em vez de
rebentar com "Unexpected token <".

À primeira vez que se usa um endereço novo, o Chrome pergunta se a extensão pode
falar com ele. É preciso autorizar: sem isso os pedidos são bloqueados antes de
saírem. Pergunta uma vez por endereço e não volta a perguntar.

O manifesto **não** fixa o endereço da API de propósito. Fixá-lo obrigaria a
editar o ficheiro e a reinstalar a extensão em todas as máquinas a cada mudança
— e este endereço muda pelo menos três vezes entre o desenvolvimento e a
produção.

### Túneis do ngrok

O plano gratuito devolve uma página de aviso em HTML, em vez da resposta, na
primeira visita de cada cliente. A extensão manda o cabeçalho
`ngrok-skip-browser-warning` em todos os pedidos para a saltar. Fora do ngrok o
cabeçalho é ignorado.

Os lançamentos entram como *por confirmar* e aparecem em **Faturação › Por confirmar**.
Nada credita saldo: o dinheiro continua a entrar só pelo fecho semanal.

## Onde funciona

| Portal | Página |
|---|---|
| Uber | `supplier.uber.com` → Rendimentos |
| Bolt | `fleets.bolt.eu` → Finances › Earnings per driver |
| Prio | `myprio.com` → Transações de Cartões › Prio Frota, depois de Pesquisar |
| Via Verde | `viaverde.pt` → Extratos e Movimentos, separador **Movimentos**, depois de Filtrar |

## O período tem de ser de segunda a domingo

O servidor recusa intervalos que atravessem duas semanas de fecho, e diz qual
escolher. A vista "Last 7 days" da Bolt é uma janela deslizante — costuma ir de
terça a segunda — e por isso **não serve**. Escolher as datas à mão resolve.

## Quando o portal mudar de aspeto

Vai acontecer. A extensão não usa caminhos de HTML: procura a tabela pelo
**texto dos cabeçalhos** — "Nome do motorista", "Rendimentos líquidos",
"Driver", "Net earnings". Isso sobrevive a rearranjos internos.

Se um portal renomear uma coluna, a extensão falha com uma mensagem que diz o
que procurou. A correção é uma linha em `src/adapters.js`, na lista de
cabeçalhos — não é preciso mexer na mecânica de leitura.

## Duas coisas que a extensão faz por si e convém saber

**Separa ganhos de reembolsos.** Na Uber, "Rendimentos líquidos" já inclui os
reembolsos de despesas. Um reembolso não é faturação: é uma devolução de
dinheiro que o motorista adiantou. A extensão envia o valor de faturação e
guarda os reembolsos à parte, para não fazerem parte da base do imposto.

**Lê os dois formatos de número.** A Uber escreve `1.412,88` e a Bolt escreve
`490.7`. Tratar os dois como português transformava 490,70 € em 4907 € — um
número plausível para uma semana boa, que ninguém saberia explicar depois.

## O que continua a ser manual

Escolher o período e clicar. Não há recolha automática agendada, de propósito:
a extensão corre no browser da pessoa, com a sessão dela, e uma recolha que
acontecesse sozinha enviaria dados que ninguém viu.


---

## Prio e Via Verde

### O que é diferente dos ganhos

| | Uber e Bolt | Prio e Via Verde |
|---|---|---|
| O que traz | ganhos | despesas: combustível e portagens |
| De quem é cada linha | pelo nome do motorista | pelo cartão Prio, ou pela matrícula e por quem tinha o carro nesse minuto |
| Período | escolhe-se uma semana, de segunda a domingo | cada linha traz a sua data; qualquer intervalo serve |
| O que não emparelha | não entra | entra sem motorista e fica na fila para atribuir à mão |
| Para onde vai | Faturação › Por confirmar | o formulário do fecho de cada motorista |

### As regras

Estão todas no topo de `backend/src/modules/expenses/expenses.math.ts`. Em resumo:

- **Prio** desconta na própria semana. O valor é o **TOTAL, com IVA**.
- **Via Verde** desconta na semana **seguinte**: o fecho de 21 a 27 leva as
  portagens de 14 a 20.
- A **mensalidade** do identificador Via Verde não se desconta — é custo do
  aparelho, como o seguro. Os **cancelados** também não. Os **pendentes** sim.
- O **cartão Prio vai com o motorista**. Se se descobrir que fica no carro,
  associa-se o cartão ao carro no painel. Não é preciso mexer em código.

### O que a pré-visualização confere por si

- **Páginas em falta.** O portal diz "49 movimentos filtrados" e a página mostra
  20? A extensão avisa. Envie a página, passe à seguinte e envie outra vez. O que
  se repetir não entra duas vezes.
- **O TOTAL da Prio.** Soma as linhas lidas e compara com o TOTAL do rodapé.
- **Linhas por ler.** Aparecem com o motivo e não são gravadas.

### Por confirmar nos portais reais

Estes leitores foram escritos a partir de capturas de ecrã, não do HTML dos
portais. Três coisas só se confirmam lá:

1. **Os ícones do estado na Via Verde.** A extensão lê o `title`, o
   `aria-label`, um `✕` escrito, ou o nome das classes. Se o portal não usar
   nenhum destes, os cancelados passam como descontáveis. A pré-visualização
   mostra-os riscados quando os reconhece: confira que o cancelado aparece riscado.
2. **Se a tabela da Via Verde pagina.** Se sim, a extensão avisa, como acima.
3. **As colunas.** Se um cabeçalho mudar de nome, a mensagem de erro diz qual
   procurou. A correção é uma linha em `src/adapters.js`.

---

## Testar sem os portais: as páginas de simulação

A Prio pede um código por SMS para o telemóvel do dono da conta. Para testar o
caminho todo sem isso, `simulacao/` tem duas páginas com a mesma estrutura das
tabelas reais e dados inventados.

### 1. Preparar a base

A migração das despesas tem de estar aplicada, e o seed cria três motoristas,
três carros e dois cartões que batem com as páginas.

```bash
# A forma mais simples: reconstruir o backend, que aplica as migrações ao arrancar.
docker compose up -d --build backend

cd backend
docker compose exec backend printenv DATABASE_URL   # troque @postgres:5432 por @localhost:5433
SEED_DESPESAS=1 DATABASE_URL="...@localhost:5433/..." npm run seed:despesas
```

### 2. Deixar a extensão ler ficheiros locais

As páginas abrem de um ficheiro, e o Chrome não deixa as extensões lerem
ficheiros sem autorização:

`chrome://extensions` → DragonFleet → **Detalhes** → ligar **Permitir acesso a URLs de ficheiros**.

Recarregue a extensão (o ícone ↻) depois de a atualizar.

### 3. Correr

As páginas abrem **a partir do ficheiro**, não do endereço da aplicação — em
`http://localhost/...` ou no ngrok quem responde é a aplicação, que devolve a
tela inicial para qualquer caminho que não conheça.

Arraste para o Chrome: `C:\dev\DragonFleet\extension\simulacao\index.html`.
Tem as quatro, por ordem. Em cada uma: clicar na extensão, conferir, **Enviar**.

| Página | O que a pré-visualização deve mostrar |
|---|---|
| Uber | 21/09/2026 a 27/09/2026 · 4 motoristas · **Rui Tavares** sem correspondência (não entra) |
| Bolt | o mesmo período · 3 motoristas · todos emparelham, "Cárla" com acento incluída |
| Prio | 6 movimentos · 412,57 € · "Bate com o TOTAL do portal" · 1 sem motorista |
| Via Verde | 9 movimentos · 10,70 € a descontar · mensalidade e cancelado riscados · 1 sem motorista |

A Uber e a Bolt vão para **Faturação › Por confirmar**; a Prio e a Via Verde,
para o formulário do fecho e, o que não emparelhou, para **Faturação › Despesas
por atribuir**.

### 4. O resultado esperado no fecho de 21/09/2026

Faturação → **Novo fecho** → motorista → semana de segunda 21/09/2026. Ao lado
de cada campo aparece o valor registado, com **Usar**.

| | Uber | Bolt | Combustível | Portagens |
|---|---:|---:|---:|---:|
| Ana Martins | 612,40 € | 160,10 € | 138,28 € | 2,00 € |
| Bruno Sousa | 455,10 € | 289,50 € | 66,21 € | 4,65 € |
| Carla Pinto | 530,25 € | 252,25 € | 163,80 € | 2,85 € |
| Por atribuir | — | — | 44,28 € | 1,20 € |

Com a viatura de 150 €, 6% de imposto e 15% de comissão, **o fecho da Ana dá
370,49 €**. Se as Configurações tiverem outra comissão, o número muda — o
cálculo é sempre o do servidor.

Na Uber, a Ana aparece como "Ana Sofia Martins": emparelha pelo primeiro e
último nome. O Rui Tavares não existe no DragonFleet e fica de fora, com aviso.

O Bruno e a Carla trocaram de carro na quinta 17/09 ao meio-dia. O combustível
da Carla vem do cartão do C-HR, que está associado ao **carro** e não a ela. O do
Bruno vem de um cartão que ninguém registou: foi a matrícula que o encontrou.

### 5. Gerar os rascunhos de uma vez

Depois dos quatro envios, em vez de abrir um fecho de cada vez:
**Faturação → Gerar rascunhos da semana** → semana de 21/09/2026.

A tabela mostra o que vai ser criado, antes de criar:

| Motorista | Carro | Total da semana |
|---|---|---:|
| Ana Martins | AA-01-DF | 370,49 € |
| Bruno Sousa | CC-03-DF | 407,20 € |
| Carla Pinto | BB-02-DF | 356,07 € |

**Criar 3 rascunhos.** Ficam na lista como rascunho: nada é creditado até cada um
ser aberto e registado. Quem já tiver fecho nessa semana é saltado, com o motivo
— e se já criou à mão o da Ana, é isso que vai ver.

Enviar a mesma página duas vezes não duplica nada. Para recomeçar do zero, basta
correr o seed outra vez — apaga as despesas, os ganhos e os fechos destes três.
