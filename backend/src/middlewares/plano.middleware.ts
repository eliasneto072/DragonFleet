// src/middlewares/plano.middleware.ts
//
// As duas guardas do plano: o que a frota comprou, e se ainda pode escrever.
//
// ─── PORQUE É QUE ISTO TAMBÉM VIVE NO SERVIDOR ──────────────────────────────
//
// Porque esconder um menu no painel não fecha nada. O endereço continua lá, a
// rota continua a responder, e quem souber escrever um pedido à mão usa o que
// não comprou. Um cadeado desenhado é uma sugestão; a guarda é aqui.
//
// O painel esconde para a interface não prometer o que não pode cumprir. O
// servidor recusa para a promessa ser verdadeira. As duas, sempre.

import type { Response, NextFunction } from 'express';
import type { PedidoComFrota } from './escopo.middleware';
import { AppError } from '../shared/errors/AppError';
import { metodoSoLe, temFuncionalidade } from '../modules/system/capacidade';
import { nomeDaFuncionalidade } from '../modules/system/funcionalidades';

/**
 * Exige que o plano da frota inclua esta funcionalidade.
 *
 * ─── PORQUE É QUE ISTO NÃO ESTÁ DENTRO DO `requireArea` ─────────────────────
 *
 * Porque as áreas e as funcionalidades não têm a mesma espessura. A área
 * FLEET tem três menus — Frotas, Oficina e Material — e um plano que venda só
 * a oficina abre FLEET na mesma, senão a rota das marcações recusava o que o
 * plano vendeu. Ao nível da área, "só a oficina" e "a frota toda" são o mesmo
 * pedido.
 *
 * Então as rotas que precisam do corte fino declaram-no, uma a uma, em
 * `routes.ts`. É mais verboso e é legível: quem lê aquele ficheiro vê que
 * `/materials` precisa de MATERIAL e `/vehicles` precisa de FLEET, sem ter de
 * ir a lado nenhum perceber porquê.
 */
export function exigeFuncionalidade(codigo: string) {
  return (req: PedidoComFrota, _res: Response, next: NextFunction) => {
    // Sem frota identificada não há plano a verificar: ou a rota por baixo
    // exige sessão e responde 401 sozinha, ou é pública de propósito.
    if (!req.frota) return next();

    // O dono da plataforma atravessa. Não é um privilégio escondido: a frota
    // dele não tem plano, logo tem tudo, e isto só o diz em voz alta para o
    // caso de um dia a frota da casa passar a ter um.
    if (req.frota.isOwner) return next();

    if (temFuncionalidade(req.frota.capacidade, codigo)) return next();

    return next(new AppError(
      `${nomeDaFuncionalidade(codigo)} não faz parte do plano desta frota.`,
      403,
      'PLANO_NAO_INCLUI',
    ));
  };
}

/**
 * Com a assinatura expirada, só se lê.
 *
 * ─── PORQUE É QUE É UMA GUARDA SÓ, E NÃO UMA POR ROTA ───────────────────────
 *
 * Porque "escrever" não é uma lista de rotas que alguém mantém actualizada —
 * é tudo o que não for GET. Posta aqui, uma rota nova nasce protegida sem
 * ninguém se lembrar de a proteger, que é a mesma ideia do muro dos
 * investidores em `routes.ts` e da camada do âmbito em `escopo.ts`.
 *
 * ─── E PORQUE É QUE LER CONTINUA ABERTO ─────────────────────────────────────
 *
 * Porque os dados são do cliente: os fechos dele, os documentos dos motoristas
 * dele. Trancá-los é ficar com a contabilidade de alguém como refém de uma
 * fatura — e deixa um motorista sem culpa nenhuma a não ver o próprio saldo.
 * O que pára é o trabalho novo. Ver a nota em `capacidade.ts`.
 */
export function bloquearEscritaSeExpirada(
  req: PedidoComFrota,
  _res: Response,
  next: NextFunction,
) {
  if (!req.frota) return next();
  if (req.frota.capacidade.podeEscrever) return next();
  if (metodoSoLe(req.method)) return next();

  return next(new AppError(
    'A assinatura desta frota expirou. Pode consultar tudo, mas não registar '
    + 'nada de novo até ser renovada.',
    403,
    'ASSINATURA_EXPIRADA',
  ));
}

/**
 * Só a frota da casa.
 *
 * Para os investimentos, os investidores e os projetos: é dinheiro dele, são
 * contratos dele, e uma frota cliente não tem nada que ver investidores — nem
 * os dela, que não existem, nem os de ninguém. Por isso não estão no catálogo
 * dos planos: não há plano nenhum que os possa incluir.
 *
 * Separado do `exigeFuncionalidade` para a recusa poder dizer a verdade. Por
 * aquele caminho, a mensagem seria "não faz parte do plano desta frota", e
 * isso convidava a perguntar quanto custa uma coisa que não se vende.
 */
export function soDaCasa(
  req: PedidoComFrota,
  _res: Response,
  next: NextFunction,
) {
  if (!req.frota) return next();
  // A FROTA e não a pessoa: uma conta de investidor dele não é dona de nada e
  // tem de poder abrir o portal dela na mesma.
  if (req.frota.daCasa) return next();

  return next(new AppError(
    'Esta área não está disponível.',
    403,
    'SO_DA_CASA',
  ));
}
