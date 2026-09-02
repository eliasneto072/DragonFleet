# Documentação do DragonFleet

Seis documentos, por ordem de quem chega de novo ao projeto.

| | Para quê | Leia se |
|---|---|---|
| **[01 · Visão geral](./01-visao-geral.md)** | O que o sistema é e a regra de negócio que o rege | É a primeira vez que vê isto |
| **[02 · Portal do motorista](./02-portal-do-motorista.md)** | As cinco telas do motorista | Vai mexer no lado do motorista |
| **[03 · Painel de administração](./03-painel-de-administracao.md)** | As dez telas do escritório | Vai mexer no lado do admin |
| **[04 · Arquitetura](./04-arquitetura.md)** | Stack, pastas, e porque estão assim | Vai escrever código |
| **[05 · Publicação](./05-deploy.md)** | Pôr no ar: Render + Cloudflare Pages | Vai fazer deploy |
| **[06 · Desenvolvimento](./06-desenvolvimento.md)** | Correr localmente, testar, contribuir | Vai começar a trabalhar |

Há ainda o **[EMAIL_SETUP.md](./EMAIL_SETUP.md)**, sobre a configuração do envio
de emails.

---

## Antes de tudo o resto

Se só tiver tempo para uma coisa, leia a secção do fecho semanal em
[01 · Visão geral](./01-visao-geral.md#o-dinheiro-tem-uma-porta-só).

Quase todos os enganos que este projeto já teve vieram de alguém supor que o
dinheiro entra por mais do que um sítio. Não entra.

---

## Sobre as capturas

Estão em `capturas/`, com o padrão `admin-*` e `motorista-*`. São de um ambiente
com dados de teste — os dois mil motoristas `@perf.dragonfleet.local` e os
cenários `@seed.dragonfleet.local` — por isso os números são grandes e às vezes
absurdos. É de propósito: servem para carregar as telas e ver o que parte com
volume a sério.

Antes de pôr em produção, esses dados saem. O procedimento está em
[05 · Publicação](./05-deploy.md#limpar-os-dados-de-teste).
