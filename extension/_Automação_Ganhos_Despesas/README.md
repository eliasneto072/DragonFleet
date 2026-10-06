# Extensão DragonFleet — fecho da semana

Recolhe os ganhos da Uber e da Bolt e as despesas da Via Verde e da Prio, e cria
os rascunhos do fecho semanal no DragonFleet.

**Nada é creditado.** Todos os fechos nascem em rascunho. O crédito continua a
ser um clique humano, na Faturação.

## Instalar

1. Chrome ou Edge → `chrome://extensions`
2. Ligar **Modo de programador**
3. **Carregar expandida** → escolher esta pasta

Se já tinha a versão anterior instalada, carregue no botão de **recarregar** no
cartão da extensão.

## Usar

1. Abrir a extensão e **escolher a semana a fechar** (segunda a domingo)
2. Passar pelos portais, e em cada um carregar em **Recolher desta página**:

   | Portal | Página |
   |---|---|
   | Via Verde | Consultar extratos › Movimentos |
   | Prio — combustível | `myprio.com/Transactions/Transactions` |
   | Prio — carregamentos | `myprio.com/Transactions/Transactions?TradIsElectric=True` |
   | Uber | `fleethub.uber.com` → Earnings |
   | Bolt | `fleets.bolt.eu` → Finances › Earnings per driver |

3. **Analisar** — mostra o que vai ser criado e todos os avisos, sem gravar nada
4. **Criar rascunhos**
5. Conferir na Faturação e creditar

A ordem não importa e o popup pode fechar-se pelo caminho: o que já foi
recolhido fica guardado até se criar os rascunhos, ou até se carregar em
*Esquecer o que foi recolhido*.

## A semana da Via Verde é outra

A Via Verde publica os movimentos com 4 a 5 dias de atraso. Para fechar 12 a 18
de outubro, o extrato que ela tem de gerar é o de **5 a 11**.

A extensão faz essa conta sozinha e **escreve as duas datas no ecrã**, para se
poder conferir. Os dois relatórios da Prio são da própria semana.

## Mudar a semana apaga o que foi recolhido

De propósito. Os PDFs guardados são de um período concreto; enviá-los com datas
novas criaria fechos com as despesas da semana errada — que é exatamente o
engano que esta ferramenta existe para evitar.

## Como isto sobrevive a uma atualização dos portais

A extensão **não constrói os pedidos**. Carrega no botão de exportar do próprio
portal, apanha o pedido que a página faz, e reenvia-o com as datas trocadas.

Isto importa mais do que parece. O MyPrio é OutSystems, e cada pedido leva lá
dentro um `versionInfo` que muda a cada atualização que a Prio publicar, além do
`ClientId` e da configuração de colunas. Escritos no código, partiam-se sem
aviso: a extensão continuaria a correr e a semana fecharia sem despesas.
Capturados, estão sempre certos.

O mesmo vale para o `IsFleet`, o campo que decide se sai o relatório do
combustível ou o dos carregamentos. Como vem do pedido real da página onde se
está, não há forma de o trocar por engano.

A única coisa que a extensão tem de saber encontrar é o **botão**, e procura-o
pelo texto ("PDF", "Exportar"). Se um portal o renomear, ela falha com uma
mensagem a dizer o que procurou — não fica em silêncio.

## O que acontece ao clicar em recolher

Vai aparecer um PDF na pasta de transferências. É o portal a fazer o que faz
sempre quando se carrega em exportar; a extensão precisa desse clique para
apanhar o pedido. Pode apagá-lo — o que conta é o que foi enviado ao
DragonFleet.

## Duas fontes para a Via Verde

A Via Verde é o único dos três portais que dá as duas coisas: o relatório em PDF
e a listagem dos movimentos, onde cada um já traz a matrícula. A extensão traz
as duas.

Serve para uma garantia que o PDF sozinho não dá. O leitor do PDF confere a soma
das matrículas contra o total impresso no próprio documento — o que apanha um
erro de leitura, mas não apanharia um PDF gerado com o período errado: esse
estaria coerente consigo mesmo e errado à mesma. Duas fontes pedidas em
separado a dar o mesmo número por matrícula é coisa que não acontece por acaso.

## Credenciais

A extensão **não tem, não pede e não guarda** palavras-passe de portal nenhum.
Corre dentro das sessões que já estão abertas no browser. Se uma sessão tiver
expirado, o pedido falha como falharia no ecrã, e ela di-lo.

A única conta que pede é a do DragonFleet, e dela guarda só o token, que expira.

## O endereço da API

É um campo, não uma constante no código.

| Onde | O que escrever |
|---|---|
| Docker local | `http://localhost:3000` |
| Túnel do ngrok | `https://<subdominio>.ngrok-free.dev/api` |
| Render | `https://<servico>.onrender.com` |

À primeira vez que se usa um endereço novo, o Chrome pergunta se a extensão pode
falar com ele. É preciso autorizar. Pergunta uma vez por endereço.

## Quando alguma coisa falhar

| Mensagem | O que quer dizer |
|---|---|
| "Não encontrei o botão de exportar" | O portal mudou o texto do botão, ou não está na página certa |
| "o portal não chegou a pedir o relatório" | O portal está lento, ou o botão deixou de disparar o pedido |
| "recusou o relatório (401/403)" | A sessão daquele portal expirou — voltar a entrar |
| "respondeu sem o relatório" | O formato da resposta mudou |
| "A leitura da ... não confere" | O PDF chegou, mas as contas não fecham — nada é importado |

A última é a mais importante, e é o comportamento desejado: uma fonte que não
confere trava a importação **inteira**, não só a sua parte. Metade das despesas
num rascunho com ar de completo é pior do que rascunho nenhum.
