# Extensão de recolha — DragonFleet

Lê a tabela de rendimentos da Uber e da Bolt e envia-a para o DragonFleet.

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
