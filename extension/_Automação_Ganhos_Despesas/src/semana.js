// extension/src/semana.js
//
// Fechar a semana: andar pelos cinco portais e criar os rascunhos.
//
// ═══ PORQUE É QUE ISTO ACUMULA EM VEZ DE FAZER TUDO DE UMA VEZ ══════════════
//
// Os cinco sítios são cinco separadores diferentes, com cinco sessões
// diferentes, e uma extensão só consegue ler a página que está à frente. Não há
// forma honesta de fazer isto num clique sem abrir separadores por conta
// própria e mexer em sessões que não são minhas.
//
// Então acumula: em cada portal carrega-se uma vez em "Recolher desta página",
// e o que foi recolhido fica guardado. Quando houver material que chegue,
// destranca-se o botão que cria os rascunhos.
//
// O estado vive no `chrome.storage.local` e não em memória: o popup fecha-se
// sempre que se clica fora dele, e perder a recolha da Via Verde por se ter
// carregado no sítio errado seria o género de coisa que faz uma pessoa desistir
// da ferramenta.
//
// ═══ A SEMANA DA VIA VERDE ═════════════════════════════════════════════════
//
// A Via Verde publica os movimentos com 4 a 5 dias de atraso. Para fechar
// 12 a 18 de outubro, o extrato a pedir-lhe é o de 5 a 11.
//
// A conta de menos sete dias é feita AQUI e mostrada no ecrã, com as datas
// escritas por extenso. Escondida dentro do código, seria impossível a quem usa
// perceber se está a acontecer — e é precisamente o tipo de detalhe que uma
// pessoa precisa de poder conferir quando as contas não baterem.

const CHAVE = 'dragonfleet:semana';

/** Os três documentos que a importação aceita, e como cada um se chama lá. */
const FONTES = {
  VIA_VERDE:      { rotulo: 'Via Verde — portagens',      campo: 'viaVerdePdf',      atraso: true },
  PRIO_FROTA:     { rotulo: 'Prio — combustível',         campo: 'prioFrotaPdf',     atraso: false },
  PRIO_ELECTRIC:  { rotulo: 'Prio — carregamentos',       campo: 'prioElectricPdf',  atraso: false },
};

// ─────────────────────────────────────────────────────────────────────────────
// Datas
// ─────────────────────────────────────────────────────────────────────────────

const dois = (n) => String(n).padStart(2, '0');
const paraDia = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;

/** A segunda-feira da semana passada. */
function segundaPassada() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7);
  return paraDia(d);
}

function maisDias(dia, dias) {
  const [a, m, d] = dia.split('-').map(Number);
  // Construída como data LOCAL: o dia civil que a pessoa escolheu não deve
  // mudar por causa de fusos horários, e `new Date('2026-10-12')` seria UTC.
  const nova = new Date(a, m - 1, d);
  nova.setDate(nova.getDate() + dias);
  return paraDia(nova);
}

const curto = (dia) => { const [, m, d] = dia.split('-'); return `${d}/${m}`; };

/** A semana a pedir a este portal. A Via Verde leva menos sete dias. */
function semanaDoPortal(semana, atraso) {
  return atraso
    ? { inicio: maisDias(semana.inicio, -7), fim: maisDias(semana.fim, -7) }
    : { inicio: semana.inicio, fim: semana.fim };
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado guardado
// ─────────────────────────────────────────────────────────────────────────────

async function lerEstado() {
  const guardado = (await chrome.storage.local.get(CHAVE))[CHAVE];
  const inicio = segundaPassada();
  // Os campos novos entram mesmo em cima de um estado antigo já guardado: sem
  // isto, quem tivesse usado a versão anterior ficava com `aDecorrer` a
  // `undefined` e o ecrã não sabia dizer se havia trabalho a correr.
  // ── Arrumar o que ficou de versões anteriores ────────────────────────────
  //
  // Os ganhos passaram a ser guardados por nome NORMALIZADO, para a Uber e a
  // Bolt não contarem a mesma pessoa duas vezes. O que já estava guardado
  // continuava com as chaves antigas, e as duas formas conviviam: nove
  // entradas para três motoristas.
  //
  // Arrumar na leitura, em vez de pedir à pessoa que limpe, porque limpar
  // significa percorrer os cinco portais outra vez.
  if (guardado?.ganhos) {
    const arrumados = {};
    for (const [chave, valor] of Object.entries(guardado.ganhos)) {
      const nome = valor?.driverName ?? chave;
      const nova = chaveDoNome(nome);
      arrumados[nova] = {
        driverName: arrumados[nova]?.driverName ?? nome,
        uberAmount: valor?.uberAmount ?? arrumados[nova]?.uberAmount,
        boltAmount: valor?.boltAmount ?? arrumados[nova]?.boltAmount,
      };
    }
    guardado.ganhos = arrumados;
  }

  return {
    semana: { inicio, fim: maisDias(inicio, 6) },
    recolhido: {},    // FONTE → { pdfBase64, nomeFicheiro, quando, movimentos }
    ganhos: {},       // nome do motorista → { uberAmount, boltAmount }
    // chave do nome → id do motorista escolhido à mão, para os nomes que o
    // servidor não consegue emparelhar sozinho. Sobrevive entre semanas de
    // propósito: um nome que a Uber escreve de forma estranha escreve-a
    // sempre, e escolher a mesma pessoa todas as semanas seria absurdo.
    emparelhamentos: {},
    aDecorrer: null,       // o portal cuja recolha está a correr, no worker
    aDecorrerDesde: null,  // para o botão não ficar preso se o worker morrer
    ultimoErro: null, // guardado, para sobreviver ao popup fechar-se
    ...(guardado ?? {}),
  };
}

const gravarEstado = (estado) => chrome.storage.local.set({ [CHAVE]: estado });

// ─────────────────────────────────────────────────────────────────────────────
// Qual portal é esta página
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pelo endereço, e no caso da Prio também pela pergunta do endereço.
 *
 * As duas páginas da Prio são a mesma, distinguidas por `?TradIsElectric=True`.
 * A recolha não depende disto para nada — ela captura o pedido real da página,
 * onde o `IsFleet` já vem certo — mas o popup precisa de saber em que gaveta
 * arrumar o que recolheu.
 */
function portalDe(url) {
  let u;
  try { u = new URL(url); } catch { return null; }

  if (u.hostname.endsWith('viaverde.pt')) return 'VIA_VERDE';
  if (u.hostname.endsWith('myprio.com')) {
    const eletrico = (u.searchParams.get('TradIsElectric') ?? '').toLowerCase() === 'true';
    return eletrico ? 'PRIO_ELECTRIC' : 'PRIO_FROTA';
  }
  if (u.hostname.includes('uber.com')) return 'UBER';
  if (u.hostname.includes('bolt.eu')) return 'BOLT';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recolher
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manda o service worker recolher, e não recolhe aqui.
 *
 * A diferença é a que faz isto funcionar: o popup fecha-se sozinho quando
 * perde o foco, e é o próprio download do relatório que lho tira. Enquanto a
 * recolha corria no popup, o PDF descarregava e o código morria a meio — o
 * sintoma era "descarregou e depois não faz mais nada".
 *
 * O worker vive fora da janela. Escreve o resultado no armazenamento, e o
 * popup mostra-o quando for reaberto, tenha ele ficado aberto ou não.
 */
async function pedirRecolha(portal, semanaEscolhida) {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!aba?.id) throw new Error('Não encontrei o separador ativo.');
  return chrome.runtime.sendMessage({
    acao: 'recolher', tabId: aba.id, portal, semana: semanaEscolhida,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Enviar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manda tudo ao DragonFleet num pedido só.
 *
 * `analisar` primeiro, sempre. O servidor devolve o que ia criar, em quem, e
 * todos os avisos — sem gravar nada. Só depois de isso estar no ecrã é que o
 * botão de criar destranca.
 *
 * Não é cerimónia: a maneira mais provável de isto correr mal não é um erro
 * de programa, é exportar a semana errada de um portal. Um plano com os
 * valores à vista mostra-o num segundo; catorze rascunhos criados, não.
 */
function corpoDoPedido(estado) {
  const corpo = {
    semanaInicio: estado.semana.inicio,
    semanaFim: estado.semana.fim,
  };

  for (const [fonte, cfg] of Object.entries(FONTES)) {
    const r = estado.recolhido[fonte];
    if (r?.pdfBase64) corpo[cfg.campo] = r.pdfBase64;
  }

  // `driverName ?? chave`: as entradas guardadas por versões anteriores não
  // têm o campo do nome — a chave ERA o nome. Sem este recurso, o servidor
  // recusava o pedido inteiro com "driverName: Required" e o trabalho de
  // recolha ficava preso até alguém o deitar fora.
  const todos = Object.entries(estado.ganhos ?? {})
    .map(([chave, g]) => ({ ...g, chave, driverName: g.driverName ?? chave }))
    .filter((g) => (g.uberAmount ?? 0) > 0 || (g.boltAmount ?? 0) > 0);

  // ── Os que já têm dono escolhido à mão ─────────────────────────────────────
  //
  // Quando o servidor não consegue emparelhar um nome, o ecrã oferece uma
  // caixa para escolher a pessoa. A escolha fica guardada aqui e passa a ir
  // por ID em vez de por nome.
  //
  // A diferença não é cosmética: por nome, o servidor volta a tentar adivinhar
  // e volta a falhar da mesma maneira, semana após semana. Por ID não há nada
  // a adivinhar.
  const escolhidos = estado.emparelhamentos ?? {};
  const porId = [];
  const porNome = [];
  for (const g of todos) {
    const userId = escolhidos[g.chave];
    if (userId) {
      porId.push({ userId, uberAmount: g.uberAmount, boltAmount: g.boltAmount });
    } else {
      porNome.push({
        driverName: g.driverName,
        uberAmount: g.uberAmount,
        boltAmount: g.boltAmount,
      });
    }
  }
  if (porId.length > 0) corpo.ganhos = porId;
  if (porNome.length > 0) corpo.ganhosPorNome = porNome;

  if (estado.forcar) corpo.forcar = true;

  return corpo;
}

/**
 * A chave de um motorista, para a Uber e a Bolt não o contarem duas vezes.
 *
 * Os dois portais escrevem o mesmo nome de maneiras diferentes — "Diogo
 * Isaías" e "DIOGO ISAIAS", "Mónica Luís" e "Monica Luis". Guardados tal e
 * qual, davam duas entradas para a mesma pessoa: o painel dizia 6 motoristas
 * quando eram 3.
 *
 * O servidor acabava por os juntar, porque emparelha por nome e soma — o valor
 * final saía certo. Mas um painel que conta mal é um painel em que não se pode
 * confiar para rever, e rever é a única coisa que ele serve para fazer.
 */
function chaveDoNome(nome) {
  return (nome ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

export const semana = {
  CHAVE,
  FONTES,
  lerEstado,
  gravarEstado,
  portalDe,
  pedirRecolha,
  corpoDoPedido,
  chaveDoNome,
  semanaDoPortal,
  segundaPassada,
  maisDias,
  curto,
};
