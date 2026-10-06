// extension/src/background.js
//
// A recolha corre AQUI, e o PDF vem da pasta de transferências.
//
// ═══ COMO SE CHEGOU A ISTO ══════════════════════════════════════════════════
//
// Três tentativas, e as duas primeiras falharam por razões que valia a pena
// descobrir:
//
//   1. COPIAR O PEDIDO e reenviá-lo com outras datas. O MyPrio respondeu 403:
//      o `X-CSRFToken` do OutSystems é de uso único. Copiar os cabeçalhos não
//      resolveu — um bilhete gasto é um bilhete gasto.
//
//   2. APANHAR A RESPOSTA do pedido da própria página. Não chegou a haver
//      resposta para apanhar: os portais não devolvem o PDF ao JavaScript da
//      página, mandam-no para a pasta de transferências como ficheiro.
//
//   3. LER O FICHEIRO DESCARREGADO. É o que está aqui.
//
// A terceira é a menos engenhosa das três e a única que funciona com o que os
// portais fazem, em vez de contra. O ficheiro já está no disco, correto e com
// as datas certas — só faltava alguém ir buscá-lo.
//
// ═══ O QUE ISTO EXIGE, E PORQUÊ ═════════════════════════════════════════════
//
// A permissão "Permitir acesso a URLs de ficheiros", que se liga à mão na
// página da extensão. É um interrutor por extensão, e o Chrome obriga a que
// seja a pessoa a ligá-lo — de propósito: ler o disco é coisa que não se dá de
// ânimo leve.
//
// Esta extensão lê UM ficheiro: o que o portal acabou de descarregar, nos
// segundos a seguir ao clique, e cujo nome o próprio Chrome lhe diz. Não
// procura nada, não percorre pastas, e não toca em mais nada.

import { semana as S } from './semana.js';

/** Quanto tempo se espera pelo download antes de desistir. */
const SEGUNDOS = 90;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Espera que apareça um download novo e devolve-o quando estiver completo.
 *
 * Ouve-se ANTES de clicar. Ao contrário, um portal rápido acabava o download
 * antes de o ouvinte existir e esta função ficava à espera para sempre de uma
 * coisa que já tinha acontecido.
 */
function esperarDownload() {
  return new Promise((resolver, rejeitar) => {
    let id = null;

    const aoCriar = (item) => { if (id === null) id = item.id; };

    const aoMudar = (delta) => {
      if (id === null || delta.id !== id) return;
      if (delta.state?.current === 'complete') { terminar(); resolver(id); }
      if (delta.state?.current === 'interrupted') {
        terminar();
        rejeitar(new Error('O portal começou a descarregar o relatório mas a transferência falhou.'));
      }
    };

    const terminar = () => {
      chrome.downloads.onCreated.removeListener(aoCriar);
      chrome.downloads.onChanged.removeListener(aoMudar);
      clearTimeout(relogio);
    };

    const relogio = setTimeout(() => {
      terminar();
      rejeitar(new Error(
        `Não apareceu nenhum ficheiro nas transferências em ${SEGUNDOS}s.\n\n`
        + 'O clique no botão de exportar pode não ter ido ao sítio certo, ou o '
        + 'portal pode estar a demorar mais do que o costume.',
      ));
    }, SEGUNDOS * 1000);

    chrome.downloads.onCreated.addListener(aoCriar);
    chrome.downloads.onChanged.addListener(aoMudar);
  });
}

/**
 * O conteúdo do ficheiro descarregado, em base64.
 *
 * `file://` e não a API de downloads: o Chrome não dá o conteúdo de um
 * download, só o caminho. Ler esse caminho precisa da permissão de acesso a
 * ficheiros, e é por isso que a mensagem de erro aqui em baixo é tão explícita
 * — sem ela, isto falha com um "Failed to fetch" que não diz nada a ninguém.
 */
async function lerFicheiro(idDoDownload) {
  const [item] = await chrome.downloads.search({ id: idDoDownload });
  if (!item?.filename) throw new Error('O Chrome não me disse onde guardou o ficheiro.');

  const caminho = item.filename.replace(/\\/g, '/');
  const url = `file:///${caminho.replace(/^\/+/, '')}`;

  let resposta;
  try {
    resposta = await fetch(url);
  } catch {
    throw new Error(
      'Não consigo ler o ficheiro que o portal descarregou.\n\n'
      + 'Em chrome://extensions, abra os Detalhes desta extensão e ligue '
      + '"Permitir acesso a URLs de ficheiros". Sem isso o Chrome não me deixa '
      + 'abrir o que está no disco.',
    );
  }
  if (!resposta.ok) throw new Error(`Não consegui abrir o ficheiro (${resposta.status}).`);

  const bytes = new Uint8Array(await resposta.arrayBuffer());
  if (bytes.length === 0) throw new Error('O ficheiro descarregado está vazio.');

  // Um PDF começa sempre por "%PDF". Confirmá-lo aqui evita mandar para o
  // servidor um HTML de sessão expirada com nome de .pdf.
  const inicio = String.fromCharCode(...bytes.slice(0, 4));
  if (inicio !== '%PDF') {
    throw new Error(
      'O ficheiro descarregado não é um PDF. A sessão do portal pode ter expirado — '
      + 'recarregue a página e tente outra vez.',
    );
  }

  // Em pedaços, porque `String.fromCharCode(...)` com um array de centenas de
  // milhares de elementos estoura a pilha de chamadas.
  let texto = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    texto += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return { base64: btoa(texto), nome: caminho.split('/').pop() };
}

// ─────────────────────────────────────────────────────────────────────────────

async function recolher({ tabId, portal, semana }) {
  const marcar = async (campos) => {
    const estado = await S.lerEstado();
    Object.assign(estado, campos);
    await S.gravarEstado(estado);
  };

  await marcar({ aDecorrer: portal, aDecorrerDesde: Date.now(), ultimoErro: null });

  try {
    await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN', files: ['src/recolha.js'],
    });

    // ── Filtrar primeiro, contar depois, descarregar só se houver ──────────
    //
    // Pôr as datas e só então contar: a contagem que interessa é a da semana
    // pedida, não a do que estava no ecrã quando se abriu o popup.
    //
    // A semana do portal, não a do fecho: a Via Verde leva menos sete dias.
    const semanaDoPortal = S.semanaDoPortal(semana, portal === 'VIA_VERDE');

    const [filtro] = await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN',
      func: (s) => window.__dragonfleetPorDatas(s),
      args: [semanaDoPortal],
    });
    // Se o filtro falhou, pára aqui. Antes este erro só aparecia depois de se
    // ter esperado pelo download; e continuar sem filtro seria pior ainda,
    // porque a contagem e o relatório sairiam de outra semana qualquer.
    if (filtro?.result?.ok === false) throw new Error(filtro.result.erro);

    const [contagem] = await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN',
      func: () => window.__dragonfleetContarMovimentos(),
    });

    if (contagem?.result === 0) {
      // Zero LIDO na página. Não se gera PDF nenhum: fica registado como
      // semana sem despesas, que é uma afirmação diferente de "em falta".
      const estado = await S.lerEstado();
      estado.recolhido[portal] = {
        vazio: true,
        quando: new Date().toISOString(),
      };
      estado.plano = null;
      estado.aDecorrer = null;
      estado.ultimoErro = null;
      await S.gravarEstado(estado);
      return { ok: true, fonte: portal, vazio: true };
    }

    // Ouvir ANTES de clicar.
    const download = esperarDownload();
    const [clique] = await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN',
      func: (s) => window.__dragonfleetClicarExportar(s, true),
      args: [semanaDoPortal],
    });
    if (clique?.result?.ok === false) throw new Error(clique.result.erro);

    const { base64, nome } = await lerFicheiro(await download);

    // Qual dos dois relatórios da Prio é este? Pelo endereço da página, que é
    // o que distingue as duas — e é o próprio popup que o manda.
    const fonte = portal;

    const estado = await S.lerEstado();
    estado.recolhido[fonte] = {
      pdfBase64: base64,
      nomeFicheiro: nome,
      quando: new Date().toISOString(),
    };
    estado.plano = null;
    estado.aDecorrer = null;
    estado.ultimoErro = null;
    await S.gravarEstado(estado);

    return { ok: true, fonte };
  } catch (e) {
    // GUARDADO e não só devolvido: o popup fecha-se quando o download lhe tira
    // o foco, e um erro que ninguém vê é um erro que volta amanhã.
    await marcar({ aDecorrer: null, ultimoErro: e?.message ?? String(e) });
    return { ok: false, erro: e?.message ?? String(e) };
  }
}

chrome.runtime.onMessage.addListener((msg, _origem, responder) => {
  if (msg?.acao !== 'recolher') return false;
  recolher(msg).then(responder, (e) => responder({ ok: false, erro: e?.message ?? String(e) }));
  return true;   // a resposta vem mais tarde
});
