# DragonFleet — contexto para continuar

Cola este ficheiro no início de uma conversa nova.

**Atualizado a 1 de setembro de 2026.**

Este documento tem só o que muda: o estado atual e o que vem a seguir. O que é
estável — modelo de negócio, arquitetura, telas, publicação — vive em
[`docs/`](./docs/) e não se repete aqui.

- **Como funciona o negócio:** [docs/01-visao-geral.md](./docs/01-visao-geral.md)
- **As telas:** [docs/02](./docs/02-portal-do-motorista.md) e [docs/03](./docs/03-painel-de-administracao.md)
- **Stack e decisões:** [docs/04-arquitetura.md](./docs/04-arquitetura.md)
- **Publicação:** [docs/05-deploy.md](./docs/05-deploy.md)
- **Convenções de trabalho:** [docs/06-desenvolvimento.md](./docs/06-desenvolvimento.md)

---

## 1. O essencial em cinco linhas

Plataforma de gestão de frota TVDE em Portugal. Cliente: **Diogo**.
Repositório: `github.com/eliasneto072/DragonFleet` · branch **`main`**
Pasta local: `C:\dev\DragonFleet` · Windows, Git Bash
Português europeu na interface e nos comentários.
Fase atual: **preparação do deploy** (Render + Cloudflare Pages).

---

## 2. Estado verificado

Frontend e backend compilam. 75 testes a passar. Os quatro contentores sobem.

### Concluído desde a última atualização

- **IBAN e recibo verde, ponta a ponta.** O que estava dado como P0 número 1 —
  "nenhum motorista consegue pedir retirada" — está resolvido. Existem
  `bank-account.tsx` no perfil, `bank-approvals.tsx` no Financeiro, o
  `bank.service.ts`, e o `apiClient.upload()` com suporte a `FormData`.
- **"Marcar como paga" no Financeiro.** Era o P0 número 3.
- **Pacote de segurança:** CORS restrito, verificação de ambiente a rebentar
  antes de abrir a porta, segredos com mínimo de 32 caracteres.
- **`helmet` e limite de tentativas** em `/auth/login`, `/auth/refresh` e no
  registo público, com `trust proxy` em 1 para o Render.
- **O bug do login.** Uma palavra-passe errada recarregava a página e esvaziava
  o formulário. O `api-client` tratava qualquer 401 como token expirado,
  incluindo o do próprio login. Ver
  [docs/04](./docs/04-arquitetura.md#o-cliente-http).
- **A marca.** Ícones refeitos com contraste — estavam a 1,88:1 e a 16px eram
  uma mancha verde. O logótipo antigo do carro saiu da página de entrada.
- **Cache dos assets.** O nginx dava `expires 1y; immutable` a ficheiros sem
  hash no nome, o que tornava qualquer troca de logótipo invisível durante um
  ano. Corrigido no nginx e replicado no `_headers` do Pages.
- **A página de entrada, reescrita.** Falava a um gestor à procura de software,
  prometia métricas que não existem e usava documentos brasileiros.
- **`render.yaml` e documentação completa** em `docs/`.

---

## 3. O que vem a seguir

### Antes da demonstração

1. **Publicar.** Seguir [docs/05-deploy.md](./docs/05-deploy.md) pela ordem
   indicada. Contar hora e meia se nada correr mal, o dobro à primeira vez.
2. **Testar a extensão** contra um portal, logo a seguir. A origem
   `chrome-extension://` não é HTTP e pode precisar de entrar no `CORS_ORIGINS`.

### Logo depois

3. **Os painéis laterais do login e do registo.** Ficaram com o enquadramento
   antigo: o login diz *"Controle ganhos, documentos e retiradas dos seus
   motoristas"* e o registo diz *"Comece a gerir a sua frota hoje"* com um selo
   "Grátis". Quem se regista é um motorista, não alguém a montar uma frota. É a
   mesma correção que a página de entrada já levou.
4. **Uma rota `GET /health`.** Sem ela o `render.yaml` não pode definir
   `healthCheckPath`, e o Render dá o serviço por vivo assim que a porta abre —
   um backend de pé com a base inacessível passa na mesma.
5. **Português do Brasil nas telas.** Restam ocorrências de "saque", "você",
   "usuário", "arquivo" fora da página de entrada.
6. **Os CSV reais da Uber e da Bolt.** Pedidos ao cliente, ainda sem resposta. É
   a primeira coisa a fazer quando chegarem — o risco do parser está descrito em
   [docs/04](./docs/04-arquitetura.md#o-risco-por-confirmar).

### Sem pressa, mas anotado

7. **`COMPROVATIVO_IBAN` existe na base e não é usado.** O comprovativo vive em
   `bank_accounts.pending_proof_url`, fora da tabela de documentos. Decidir: ou
   passa a ser `Document`, ganhando a tela de revisão que já existe, ou o valor
   sai do enum.
8. **A importação de ganhos está na tela do motorista.** A decisão foi o
   contrário — o admin recebe os ficheiros e confere. Fica onde está até existir
   a receção do lado da administração.
9. **`withdrawalsService` vive em `features/driver/services/`** e é importado
   pelo Financeiro. Serviço partilhado alojado na feature errada.
10. **Código morto:** `shared/lib/mock-data.ts` e `shared/types/index.ts`.
    Ninguém os importa, e contêm modelos que contradizem a API real
    (`method: 'pix' | 'paypal'`, estados em minúsculas). Apagar antes que alguém
    os importe por engano.
11. **`npm audit`.** Três altas, todas em `prisma → @prisma/config →
    deepmerge-ts`. Como assunto próprio, com typecheck e build a confirmar antes
    e depois. **Nunca `npm audit fix --force`.**
12. **`backend/modelo_dragon_fleet.jpeg`** é o diagrama ER com nome enganador, e
    está na pasta errada. Devia ser `docs/modelo-de-dados.jpeg`.

---

## 4. Decisões fechadas — não voltar a debater

**A comissão incide sobre o lucro**, não sobre o bruto. Os lançamentos do
motorista são conferência e não creditam. Saldo negativo é permitido; pedir
acima do disponível não é. A percentagem, o IBAN e o recibo congelam depois do
facto. Detalhe em [docs/01](./docs/01-visao-geral.md).

**O registo é público e a conta nasce ativa.** Quem não pertence à frota é
desativado pelo Diogo na tela de Motoristas. Foi decidido assim de propósito, em
alternativa a nascer pendente ou a ser por convite.

**O IBAN vive no Perfil do motorista**, não em Documentos. O admin aprova no
Financeiro, em aba própria, ao lado de onde o dinheiro sai.

**A extensão de browser é a via principal** para a recolha Uber/Bolt; o CSV é a
secundária. A receção e a tela de conferência vêm primeiro, a extensão depois.

---

## 5. Como trabalhamos

As convenções completas estão em
[docs/06-desenvolvimento.md](./docs/06-desenvolvimento.md). O que não pode
falhar:

**Ficheiros inteiros, num zip com a estrutura do projeto, mais um `aplicar.sh`.**
Nunca fragmentos com "adicione aqui". Substituição manual ficheiro a ficheiro
esquece sempre um.

```bash
bash /c/dev/_patch/<pacote>/aplicar.sh /c/dev/DragonFleet
```

**Verificar antes de empacotar:** `npm run typecheck` no frontend, `npx tsc
--noEmit` no backend.

**Contabilidade dos ficheiros.** Antes de empacotar, conseguir apontar a edição
que produziu cada ficheiro alterado. Do outro lado, passar os olhos pelo `git
diff` antes de commitar — se aparecer algum que não foi anunciado, parar.

**Debater antes de implementar**, sobretudo quando envolve dinheiro. Opções com
prós e contras, uma recomendação, e esperar a decisão. Quando o utilizador
delega, decidir e **registar a decisão e a razão** — no código e aqui.

**A fonte fiável é o GitHub**, desde que não haja alterações locais por commitar.
Se houver, pedir para commitar primeiro, ou pedir o zip da pasta.
