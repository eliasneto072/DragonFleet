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
  //
  // A hora é um grupo PRÓPRIO e opcional. A versão anterior aceitava entre as
  // duas datas apenas o que não fosse algarismo — e "04:03" é feito de
  // algarismos. Com a hora que a Uber escreve sempre, a expressão nunca casava,
  // e a extensão dizia "período não identificado" no portal real.
  const HORA = '(?:[\\s,]+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:[AaPp]\\.?[Mm]\\.?)?)?';
  const pt = corpo.match(new RegExp(
    `(\\d{2})\\/(\\d{2})\\/(\\d{4})${HORA}\\s*[-–—]\\s*(\\d{2})\\/(\\d{2})\\/(\\d{4})`,
  ));
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

// ─── Prio ─────────────────────────────────────────────────────────────────────
//
// myprio.com → Transações de Cartões › Prio Frota, depois de Pesquisar.
//
//   POSTO | REDE | DATA | CARTÃO | ESTADO | LITROS | COMB. | RECIBO | KM'S |
//   ID COND. | FATURA | V. UNIT. (S/IVA) | TOTAL
//
// DATA e CARTÃO têm duas linhas cada — "23/09/2026" / "23:20", e o número do
// cartão / a matrícula. Seguem com o "\n" no meio; quem as separa é o servidor,
// que tem testes para isso.
//
// O valor é o TOTAL, com IVA. Conferido nas capturas do cliente:
// 40 L × 1,7797 € × 1,23 = 87,56 €, e o portal mostra 87,55 €.
//
// O ESTADO da Prio é o do CARTÃO ("Ativo"), não o do abastecimento. Segue na
// mesma, para ficar registado, mas não decide nada.

function extrairPrio() {
  const g = extrator.lerGrelha(['cartao', 'total'], {
    data: 'data',
    cartao: 'cartao',
    posto: 'posto',
    comb: 'comb',
    total: 'total',
    estado: 'estado',
    recibo: 'recibo',
  });

  if (!g) {
    throw new Error(
      'Não encontrei a tabela de transações nesta página.\n\n' +
      'Confirme que está em Transações de Cartões › Prio Frota e que carregou em ' +
      'Pesquisar. A tabela tem de estar visível, com as colunas CARTÃO e TOTAL.',
    );
  }
  if (g.colunasEmFalta.includes('data')) {
    throw new Error('A tabela da Prio não tem a coluna DATA. O portal pode ter mudado de aspeto.');
  }

  const rows = g.linhas
    .map((l) => ({
      date: extrator.textoCelula(l.data),
      card: extrator.textoCelula(l.cartao),
      station: extrator.textoCelula(l.posto) || null,
      fuel: extrator.textoCelula(l.comb) || null,
      amount: extrator.quantiaDe(extrator.textoCelula(l.total)),
      status: extrator.textoCelula(l.estado) || null,
      receipt: extrator.textoCelula(l.recibo) || null,
    }))
    .filter((r) => r.date || r.amount);

  const corpo = document.body.innerText;

  // "1 a 2 de 2 registos": se a página só mostra parte, a pré-visualização
  // tem de o dizer antes de alguém enviar metade da semana.
  const pag = corpo.match(/(\d+)\s*a\s*(\d+)\s*de\s*(\d+)\s*registos?/i);

  // "TOTAL (19/09/2026 a 24/09/2026)  117.29 €": serve de conferência. Se a
  // soma do que lemos não bater com isto, ficou alguma linha de fora.
  const total = corpo.match(/TOTAL\s*\(([^)]*)\)\s*([\d.,]+)\s*€/i);

  return {
    rows,
    anunciadas: pag ? Number(pag[3]) : null,
    totalPortal: total ? parseMoney(total[2]) : null,
    periodoPortal: total ? total[1].trim() : null,
  };
}

// ─── Via Verde ────────────────────────────────────────────────────────────────
//
// viaverde.pt › Empresas → Extratos e Movimentos, separador MOVIMENTOS, depois
// de Filtrar.
//
//   Identificador / Conta Mobilidade | Matrícula | Descrição | Serviço |
//   Meio de pagamento | Valor | Estado
//
// Não há coluna de data: a data está DENTRO da descrição, com a entrada e a
// saída — "Pontinha >> Belas PV" / "2026-09-22 09:23:20 > 2026-09-22 09:26:23".
// A descrição segue inteira; o servidor tira dela a data e o trajeto.
//
// Serviço e Estado são ÍCONES. O que os descreve (title, aria-label, um glifo)
// vai como texto. Se não houver nada que os descreva, vai vazio — e isso é
// para confirmar no portal real, porque as capturas não mostram o HTML.

function extrairViaVerde() {
  const g = extrator.lerGrelha(['matricula', 'descricao', 'valor'], {
    identificador: 'identificador',
    matricula: 'matricula',
    descricao: 'descricao',
    servico: 'servico',
    valor: 'valor',
    estado: 'estado',
  });

  if (!g) {
    throw new Error(
      'Não encontrei a tabela de movimentos nesta página.\n\n' +
      'Confirme que está em Extratos e Movimentos, no separador MOVIMENTOS ' +
      '(não em Extratos), e que carregou em Filtrar.',
    );
  }

  const rows = g.linhas
    .map((l) => ({
      identifier: extrator.textoCelula(l.identificador) || null,
      plate: extrator.textoCelula(l.matricula) || null,
      description: extrator.textoCelula(l.descricao),
      service: extrator.descreverIcone(l.servico),
      amount: extrator.quantiaDe(extrator.textoCelula(l.valor)),
      status: extrator.textoCelula(l.estado) && !/^[×✕✖✗xX✓✔]$/.test(extrator.textoCelula(l.estado))
        ? extrator.textoCelula(l.estado)
        : extrator.descreverIcone(l.estado),
    }))
    .filter((r) => r.description || r.amount);

  // "49 movimentos filtrados"
  const pag = document.body.innerText.match(/(\d+)\s+movimentos?\s+filtrados?/i);

  return { rows, anunciadas: pag ? Number(pag[1]) : null, totalPortal: null, periodoPortal: null };
}

// ─── Qual portal é este ───────────────────────────────────────────────────────

/**
 * Pelo endereço — ou pela marca de simulação, nas páginas de teste.
 *
 * As páginas de extension/simulacao/ declaram-se com
 * <meta name="dragonfleet-simulacao" content="PRIO">. Sem isto não havia como
 * as reconhecer: abrem de um ficheiro local, sem o endereço do portal.
 */
function detetarPortal() {
  const sim = document.querySelector('meta[name="dragonfleet-simulacao"]')?.getAttribute('content');
  if (sim) return { portal: sim.trim().toUpperCase(), simulacao: true };

  const h = location.hostname;
  if (h.includes('supplier.uber.com')) return { portal: 'UBER' };
  if (h.includes('bolt.eu')) return { portal: 'BOLT' };
  if (h.includes('myprio.com')) return { portal: 'PRIO' };
  if (h.includes('viaverde.pt')) return { portal: 'VIA_VERDE' };
  return null;
}

function extrair() {
  const d = detetarPortal();
  if (!d) {
    throw new Error(
      'Esta página não é de nenhum dos portais que a extensão conhece:\n' +
      'Uber, Bolt, Prio ou Via Verde.',
    );
  }

  // Despesas: movimentos com data, matrícula e valor. Vão para /expenses.
  if (d.portal === 'PRIO' || d.portal === 'VIA_VERDE') {
    const lido = d.portal === 'PRIO' ? extrairPrio() : extrairViaVerde();
    return { kind: 'EXPENSES', source: d.portal, simulacao: !!d.simulacao, ...lido };
  }

  // Ganhos: um nome e um valor por linha, num período. Vão para /earnings.
  const rows = d.portal === 'UBER' ? extrairUber() : extrairBolt();
  return { kind: 'EARNINGS', platform: d.portal, simulacao: !!d.simulacao, rows, periodo: extrairPeriodo() };
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
