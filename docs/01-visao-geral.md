# 01 · Visão geral

## O que é

Uma plataforma de gestão para uma frota TVDE em Portugal. Os motoristas
conduzem para a Uber e para a Bolt; a empresa é dona das viaturas, fica com uma
percentagem e faz as contas todas as semanas.

Não é um produto de prateleira. É o sistema de um operador concreto, e isso
explica escolhas que num SaaS genérico não fariam sentido — como a comissão ser
uma configuração global e não um plano, ou o registo ser aberto com desativação
posterior em vez de convite.

## Para quem

**O administrador** regista, por semana e por motorista, o que entrou em cada
plataforma e o que saiu em despesas. Aprova documentos, aprova IBANs, aprova
retiradas e transfere o dinheiro.

**O motorista** vê o resultado de cada semana, comunica valores para conferência,
envia documentos, regista o IBAN e pede retiradas.

Há um terceiro papel no schema, `MANAGER`, ainda sem telas próprias.

---

## O dinheiro tem uma porta só

Esta é a regra que explica quase tudo o resto.

> *"Motorista fez 100€ Uber e 100€ Bolt, isso dá 200€; gastou 50€ em gasóleo e
> 50€ em via verde, o resultado é 100€; a percentagem vai ser sobre os 100€ de
> lucro e não dos 200€."*
> — o cliente, em reunião

O fecho semanal é o **único** momento em que o saldo do motorista sobe.

```
  receitas          Uber + Bolt + outras plataformas
− despesas          Via Verde, combustível, encargo da viatura, outros
─────────────
= lucro
− imposto           percentagem sobre a faturação, configurável
− comissão          percentagem sobre o lucro, configurável
─────────────
= líquido           creditado no saldo do motorista
```

### Os lançamentos do motorista não creditam

O motorista pode comunicar valores pelo "Registar ganho". Isso é **conferência**,
não depósito. O administrador confirma ou recusa, e confirmar significa apenas
"confere com o que vou fechar".

Se ambos creditassem, a semana seria paga duas vezes. Já houve quem tentasse
"corrigir" isto — não corrija.

### Saldo negativo é permitido

Um motorista cujas despesas superem os ganhos fica a dever, e o valor é
descontado dos fechos seguintes. Houve guardas a impedir isto e foram removidas
de propósito.

O que **não** é permitido é pedir retirada acima do disponível.

### Valores congelados

Três coisas que não podem mudar depois de acontecerem:

| O quê | Porquê |
|---|---|
| A percentagem aplicada | Cada fecho grava a sua. Mudar a configuração global não pode reescrever contas já pagas. |
| O IBAN de destino | Cada retirada aprovada grava-o. O histórico tem de dizer para onde o dinheiro foi de facto. |
| O recibo emitido | Não muda depois de emitido. |

Esta é a regra mais fácil de partir por acidente, porque a forma natural de
escrever o código — ler a percentagem das Configurações no momento de mostrar —
dá o resultado errado assim que alguém mexer na configuração.

---

## O ciclo completo

```
  1. O motorista conduz
        │
  2. Ele comunica os valores   ──┐   (conferência; não credita)
        │                        │
  3. Chegam ficheiros CSV       ─┤   (Uber / Bolt; ou a extensão, mais tarde)
        │                        │
  4. O admin confere ←───────────┘
        │
  5. O admin fecha a semana        ← ÚNICO ponto onde o saldo sobe
        │
  6. O motorista vê o fecho e o saldo
        │
  7. Pede retirada + anexa recibo verde
        │
  8. O admin aprova → transfere → marca como paga
```

Cada passo depende do anterior. Não há atalho do 2 para o 6.

---

## Documentos

A conta do motorista fica libertada quando os documentos estão aprovados.

**Do motorista:** cartão de cidadão, registo criminal, carta de condução,
certificado TVDE, fotografia de perfil.

**Do veículo:** DUA, seguro (carta verde), seguro (condições especiais),
inspeção técnica periódica.

São documentos portugueses. Se vir CNH ou CRLV em algum lado, é engano — não
existem no sistema.

A validade é preenchida pela administração ao rever, e um trabalho agendado
avisa antes de cada um caducar. O prazo do aviso está nas Configurações.

---

## Dados bancários e recibo verde

Duas exigências antes de qualquer retirada sair:

**IBAN aprovado.** O motorista submete o IBAN com comprovativo de titularidade;
o administrador aprova ou recusa com motivo. Sem IBAN aprovado o pedido é
recusado com `BANK_ACCOUNT_REQUIRED`, e o botão de nova retirada aparece
desativado com atalho para o Perfil.

**Recibo verde anexado.** O pedido vai em multipart com o ficheiro. Sem ele, a
rota recusa.

O escritório precisa depois de saber a que sociedade cada motorista emitiu
recibo — daí a tela de Recibos Verdes ter uma lista de sociedades e um registo
por classificar.

---

## O que ainda não existe

Coisas que alguém pode procurar e não encontrar, para poupar a busca:

- **Contagem de viagens e avaliação do motorista.** Não há campo nenhum. A
  palavra "corridas" aparece como rótulo de um valor bruto, não como contagem.
- **Metas.** Não existem.
- **Limite de tentativas fora da autenticação.** O limite cobre o login, o
  refresh e o registo. O resto da API não tem.
- **A extensão de browser.** Decidida, por construir. Ver
  [04 · Arquitetura](./04-arquitetura.md#a-recolha-automática-uberbolt).
