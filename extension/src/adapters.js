// extension/src/adapters.js
//
// Um adaptador por portal: sabe o que a página mostra e devolve linhas
// normalizadas.
//
// ─── O QUE CADA PORTAL DÁ, CONFIRMADO NAS CAPTURAS ───────────────────────────
//
// UBER — "Rendimentos do motorista"
//   Nome do motorista | Rendimentos totais | Reembolsos e despesas |
//   Ajustes | Pagamento | Rendimentos líquidos
//
//   Verificado: 312,89 + 9,25 + 0,00 = 322,14. O "líquido" é a SOMA das outras,
//   ou seja, o valor a pagar COM os reembolsos incluídos. Um reembolso não é
//   ganho — é dinheiro que o motorista adiantou e lhe está a ser devolvido — e
//   por isso os dois são enviados em separado: o DragonFleet decide o que fazer
//   com cada um, em vez de receber uma soma que já não se pode desfazer.
//
// BOLT — "Earnings per driver"
//   Driver | Gross earnings (total) | ... | Net earnings | ...
//
//   Verificado: 490,7 de bruto e 371,97 de líquido para a Mónica — a Bolt
//   retém cerca de 24%. O que interessa ao fecho é o LÍQUIDO, que é o que a
//   frota recebe.
//
// ─── POR QUE ESTA CAMADA EXISTE À PARTE DO EXTRATOR ──────────────────────────
//
// O extrator não sabe nada de Uber nem de Bolt: encontra tabelas por
// cabeçalho. Os adaptadores sabem quais são os cabeçalhos e o que significam.
// Quando um portal mudar um rótulo, muda-se aqui uma linha — e não se toca na
// mecânica de leitura.


/** Datas no formato que o servidor exige: AAAA-MM-DD. */
function paraDia(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Extrai o período do seletor de datas da página.
 *
 * Os dois portais mostram-no como texto: a Uber "24/08/2026 04:03 AM -
 * 30/08/2026 12:23 AM", a Bolt "11 Aug - 17 Aug". Ler daí evita pedir à pessoa
 * que reescreva o que já está no ecrã — e evita o erro de ela enganar-se.
 *
 * Devolve null quando não encontra: aí a extensão pergunta, em vez de adivinhar
 * um período e importar uma semana para dentro de outra.
 */
function extrairPeriodo() {
  const corpo = extrator.texto(document.body);

  // DD/MM/AAAA – DD/MM/AAAA, com ou sem horas pelo meio.
  const pt = corpo.match(/(\d{2})\/(\d{2})\/(\d{4})[^\d]{0,20}?(?:AM|PM)?[^\d]{0,5}-[^\d]{0,5}(\d{2})\/(\d{2})\/(\d{4})/);
  if (pt) {
    return {
      periodStart: `${pt[3]}-${pt[2]}-${pt[1]}`,
      periodEnd: `${pt[6]}-${pt[5]}-${pt[4]}`,
    };
  }

  // "11 Aug - 17 Aug" — sem ano. Assume o ano corrente, e recua um se o
  // intervalo cair no futuro (uma semana de dezembro vista em janeiro).
  const MESES = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const en = corpo.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s*[-–]\s*(\d{1,2})\s+([A-Za-z]{3})/);
  if (en) {
    const ano = new Date().getFullYear();
    const ini = new Date(ano, MESES[en[2].toLowerCase()], Number(en[1]));
    const fim = new Date(ano, MESES[en[4].toLowerCase()], Number(en[3]));
    if (fim > new Date()) { ini.setFullYear(ano - 1); fim.setFullYear(ano - 1); }
    return { periodStart: paraDia(ini), periodEnd: paraDia(fim) };
  }

  return null;
}

// ─── Uber ─────────────────────────────────────────────────────────────────────

function extrairUber() {
  const CABECALHOS = ['nome do motorista', 'rendimentos liquidos'];
  const encontrada = extrator.encontrarTabela(CABECALHOS);

  if (!encontrada) {
    throw new Error(
      'Não encontrei a tabela de rendimentos nesta página.\n\n' +
      'Confirme que está em Rendimentos, no portal de fornecedor da Uber, e que ' +
      'a lista de motoristas está visível.',
    );
  }

  if (encontrada.tipo === 'table') {
    const linhas = extrator.lerLinhasDeTable(encontrada.el, encontrada.cabecalhos, {
      nome: 'nome do motorista',
      totais: 'rendimentos totais',
      reembolsos: 'reembolsos',
      ajustes: 'ajustes',
      liquidos: 'rendimentos liquidos',
    });

    return linhas.map((l) => ({
      driverName: l.nome,
      // O GANHO é o total, sem reembolsos.
      //
      // O portal soma tudo em "líquidos", mas um reembolso de despesa não é
      // faturação: é uma devolução. Enviar a soma faria o imposto de 6% incidir
      // sobre dinheiro que o motorista já tinha gasto do próprio bolso.
      amount: parseMoney(l.totais) ?? parseMoney(l.liquidos) ?? 0,
      // Vão à parte, para o DragonFleet decidir o que fazer com eles.
      reimbursements: parseMoney(l.reembolsos) ?? 0,
      adjustments: parseMoney(l.ajustes) ?? 0,
      netPaid: parseMoney(l.liquidos) ?? 0,
    }));
  }

  // A página desenha a lista com `div`. Aí só há um valor por linha, que é o
  // líquido — foi o que se viu no PDF impresso, onde a tabela colapsa.
  return extrator.lerLinhasDeDivs(encontrada.el).map((l) => ({
    driverName: l.nome,
    amount: parseMoney(l.valores[l.valores.length - 1]) ?? 0,
    reimbursements: 0,
    adjustments: 0,
    netPaid: parseMoney(l.valores[l.valores.length - 1]) ?? 0,
    /** Sinaliza que as parcelas não estavam separadas nesta leitura. */
    coarse: true,
  }));
}

// ─── Bolt ─────────────────────────────────────────────────────────────────────

function extrairBolt() {
  const CABECALHOS = ['driver', 'net earnings'];
  const encontrada = extrator.encontrarTabela(CABECALHOS);

  if (!encontrada) {
    throw new Error(
      'Não encontrei a tabela de ganhos nesta página.\n\n' +
      'Confirme que está em Finances › Earnings per driver, no Bolt Fleet.',
    );
  }

  if (encontrada.tipo === 'table') {
    const linhas = extrator.lerLinhasDeTable(encontrada.el, encontrada.cabecalhos, {
      nome: 'driver',
      bruto: 'gross earnings (total)',
      liquido: 'net earnings',
      gorjetas: 'rider tips',
    });

    return linhas.map((l) => ({
      driverName: l.nome,
      // O líquido: é o que a frota recebe, depois da comissão da Bolt.
      amount: parseMoney(l.liquido) ?? 0,
      gross: parseMoney(l.bruto) ?? 0,
      tips: parseMoney(l.gorjetas) ?? 0,
    }));
  }

  return extrator.lerLinhasDeDivs(encontrada.el).map((l) => ({
    driverName: l.nome,
    amount: parseMoney(l.valores[l.valores.length - 1]) ?? 0,
    coarse: true,
  }));
}

/** Qual o portal desta página, pelo endereço. */
function detetarPortal() {
  const h = location.hostname;
  if (h.includes('supplier.uber.com')) return 'UBER';
  if (h.includes('bolt.eu') || h.includes('fleets.bolt.eu')) return 'BOLT';
  return null;
}

function extrair() {
  const portal = detetarPortal();
  if (!portal) throw new Error('Esta página não é o portal da Uber nem o da Bolt.');

  const rows = portal === 'UBER' ? extrairUber() : extrairBolt();
  const periodo = extrairPeriodo();

  return { platform: portal, rows, periodo };
}


// ─── Ponte para o popup ───────────────────────────────────────────────────────
//
// O `chrome.scripting.executeScript` com `files` carrega isto como script
// clássico, não como módulo: os `import`/`export` não existem neste contexto.
// Por isso os dois ficheiros são carregados em sequência e comunicam pelo
// `window`, e a função é exposta com um nome improvável de colidir.
//
// O erro é DEVOLVIDO em vez de lançado: uma exceção dentro do executeScript
// chega ao popup como "resultado indefinido", sem mensagem nenhuma.
window.__dragonfleetExtrair = function () {
  try {
    return extrair();
  } catch (e) {
    return { erro: e.message, rows: [] };
  }
};
