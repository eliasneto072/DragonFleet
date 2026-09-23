// src/shared/config/portal.ts
//
// Qual dos dois sites é este.
//
// ─── UM PROJETO, DOIS SITES ─────────────────────────────────────────────────
//
// dragonfleet.pt        a frota: motoristas e administração
// invest.dragonfleet.pt o portal do investidor
//
// São o MESMO programa, servido do mesmo sítio, e decidem o que mostrar pelo
// endereço por onde foram abertos. A alternativa — dois projetos — obrigava a
// corrigir cada erro duas vezes, a manter duas versões da mesma sessão e a
// fazer dois deploys de cada vez. Aqui é um envio só e os dois ficam certos.
//
// Quem abre invest.dragonfleet.pt não vê nada da frota: outro login, outras
// cores, outras páginas. Não fica a saber que é o mesmo programa, e não tem de
// ficar.
//
// ─── E O QUE IMPEDE ALGUÉM DE ENTRAR PELO LADO ERRADO ───────────────────────
//
// Isto, nada — é interface, e interface não tranca nada. Quem tem um token de
// investidor leva 403 em toda a API da frota, decidido no servidor
// (`deny-investor.middleware.ts`). O que está aqui serve para as pessoas certas
// verem a coisa certa, não para travar as erradas.

export type Portal = 'fleet' | 'invest';

const CHAVE_LOCAL = 'dragonfleet:portal';

function detetar(): Portal {
  if (typeof window === 'undefined') return 'fleet';

  // 1. O endereço manda. É isto que decide em produção.
  const host = window.location.hostname.toLowerCase();
  if (host === 'invest.dragonfleet.pt' || host.startsWith('invest.')) return 'invest';

  // 2. Em desenvolvimento não há subdomínios: o localhost é um só. Um
  //    ?portal=invest no endereço fica guardado para as navegações seguintes,
  //    senão o primeiro clique dentro da aplicação voltava ao site da frota.
  const pedido = new URLSearchParams(window.location.search).get('portal');
  if (pedido === 'invest' || pedido === 'fleet') {
    try { sessionStorage.setItem(CHAVE_LOCAL, pedido); } catch { /* sessão privada */ }
    return pedido;
  }
  try {
    const guardado = sessionStorage.getItem(CHAVE_LOCAL);
    if (guardado === 'invest' || guardado === 'fleet') return guardado;
  } catch { /* sessão privada: segue para o site da frota */ }

  return 'fleet';
}

export const PORTAL: Portal = detetar();
export const isInvestPortal = PORTAL === 'invest';

/**
 * Põe o site com a cara certa antes do React pintar o primeiro ecrã.
 *
 * A classe no `<html>` é o que ativa as cores do portal (ver `invest.css`).
 * Sem isto, o portal do investidor abria verde durante uma fração de segundo —
 * e a primeira impressão de um site que se quer sóbrio é precisamente isso.
 */
export function aplicarPortal(): void {
  if (typeof document === 'undefined') return;
  const raiz = document.documentElement;

  if (isInvestPortal) {
    raiz.classList.add('portal-invest', 'dark');
    document.title = 'DragonFleet Capital';
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', 'Portal de investimento DragonFleet.');
  }
}
