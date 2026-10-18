// extension/src/popup-semana.js
//
// O ecrã do fecho da semana: cinco portais, uma lista, dois botões.
//
// ─── PORQUE É QUE ESTE FLUXO VIVE À PARTE DO popup.js ───────────────────────
//
// Porque o outro funciona. O `popup.js` envia os lançamentos comunicados para
// `/earnings/ingest`, está testado e é usado. Este cria fechos, que é outra
// coisa: outra rota, outras permissões, outro modo de falhar.
//
// Metê-los no mesmo ficheiro poupava umas linhas e punha em risco o que já
// está a dar. Ficam lado a lado; o `popup.html` mostra um ou outro conforme o
// portal onde a pessoa está.

import { semana as S } from './semana.js';

const $ = (id) => document.getElementById(id);
const eur = (n) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n || 0);

let estado = null;
let plano = null;

/** Quem fala com a API — emprestado pelo popup.js, que trata da sessão. */
let api = { base: '', token: '', cabecalhos: () => ({}), respostaJson: async (r) => r.json() };

export function configurarApi(ponte) { api = ponte; }

// ─────────────────────────────────────────────────────────────────────────────

// ── Interface (v0.9) ────────────────────────────────────────────────────────
//
// Daqui até à recolha é só desenho. Nada nesta parte fala com os portais nem
// com o servidor: lê o `estado` e o `plano` e mostra-os. A recolha, a análise
// e a criação continuam nas mesmas funções, com os mesmos pedidos.

/** Os cinco sítios a visitar, pela ordem em que aparecem na lista. */
const PORTAIS = [
  { fonte: 'VIA_VERDE',     nome: 'Via Verde',            det: 'Portagens · semana anterior', url: 'https://www.viaverde.pt/' },
  { fonte: 'PRIO_FROTA',    nome: 'Prio — combustível',   det: 'Transações de cartões',       url: 'https://www.myprio.com/Transactions/Transactions' },
  { fonte: 'PRIO_ELECTRIC', nome: 'Prio — carregamentos', det: 'Transações elétricas',        url: 'https://www.myprio.com/Transactions/Transactions?TradIsElectric=True' },
  { fonte: 'UBER',          nome: 'Uber',                 det: 'Rendimentos',                 url: 'https://fleethub.uber.com/' },
  { fonte: 'BOLT',          nome: 'Bolt',                 det: 'Earnings per driver',         url: 'https://fleets.bolt.eu/' },
];
const nomeDoPortal = (fonte) => PORTAIS.find((p) => p.fonte === fonte)?.nome ?? fonte;

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const diaDaSemana = (dia) => { const [a, m, d] = dia.split('-').map(Number); return DIAS[new Date(a, m - 1, d).getDay()]; };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Depois de criar: o ecrã de conclusão, até se começar outra semana. */
let sucesso = null;

/** Depois de analisar, a lista dos portais dobra-se; isto abre-a de novo. */
let verLista = false;

/**
 * A faixa de mensagens, no topo. `tipo`: 'aviso' (âmbar), 'mau' (vermelho) ou
 * 'bom' (verde).
 */
function aviso(msg, tipo = 'aviso') {
  const el = $('semana-erro');
  el.textContent = msg ?? '';
  el.className = `faixa-aviso${tipo === 'mau' ? ' mau' : tipo === 'bom' ? ' bom' : ''}`;
  el.hidden = !msg;
}

/** Onde está a Faturação, a partir do endereço da API. */
function enderecoDaFaturacao() {
  try {
    const u = new URL(api.base);
    if (u.hostname.startsWith('api.')) u.hostname = u.hostname.slice(4);
    if (u.port === '3000') u.port = '';
    u.pathname = '/app/admin/settlements';
    u.search = '';
    return u.toString();
  } catch {
    return null;
  }
}

function abrirSeparador(url) {
  if (url) chrome.tabs.create({ url });
}

/** O que já foi recolhido de um portal, para a linha da lista. */
function situacaoDe(fonte) {
  if (fonte === 'UBER' || fonte === 'BOLT') {
    const campo = fonte === 'UBER' ? 'uberAmount' : 'boltAmount';
    const deste = Object.values(estado.ganhos ?? {}).filter((g) => g?.[campo] !== undefined);
    if (!deste.length) return null;
    const total = deste.reduce((s, g) => s + (g[campo] ?? 0), 0);
    return { texto: `${plural(deste.length, 'motorista', 'motoristas')} · ${eur(total)}`, vazio: false };
  }
  const r = estado.recolhido[fonte];
  if (!r) return null;
  if (r.vazio) return { texto: 'Sem movimentos — 0 €', vazio: true };
  const n = Number(r.movimentos);
  return { texto: Number.isFinite(n) && n > 0 ? `Recolhido · ${plural(n, 'movimento', 'movimentos')}` : 'Recolhido', vazio: false };
}

function desenharPassos(atual) {
  const nomes = ['Semana', 'Recolher', 'Analisar', 'Criar'];
  $('passos').innerHTML = nomes.map((n, i) => {
    const num = i + 1;
    const cls = num < atual ? 'feito' : num === atual ? 'atual' : '';
    return `<div class="passo ${cls}"><div class="barra"></div>${num} ${n}</div>`;
  }).join('');
}

function desenharSucesso() {
  const alvo = $('semana-sucesso');
  const { criados, ignorados, falhas } = sucesso;
  const detalhes = [
    ignorados ? `${plural(ignorados, 'ignorado', 'ignorados')} (já tinham fecho).` : '',
    falhas ? `Falhas: ${falhas}` : '',
    'Nada foi creditado.',
  ].filter(Boolean).map(esc).join('<br>');
  alvo.innerHTML = `
    <div class="grande">✓</div>
    <h2>${esc(plural(criados, 'rascunho criado', 'rascunhos criados'))}</h2>
    <p>${detalhes}</p>
    <button class="principal" id="sucesso-faturacao">Abrir a Faturação ↗</button>
    <button class="secundario" id="sucesso-outra">Fechar outra semana</button>`;
  const url = enderecoDaFaturacao();
  $('sucesso-faturacao').hidden = !url;
  $('sucesso-faturacao').addEventListener('click', () => abrirSeparador(url));
  $('sucesso-outra').addEventListener('click', async () => {
    sucesso = null;
    aviso('');
    const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
    desenhar(S.portalDe(aba?.url ?? ''));
  });
}

function desenhar(portalAtual) {
  const { inicio, fim } = estado.semana;
  $('semana-de').value = inicio;
  $('semana-ate').value = fim;
  $('semana-resumo').textContent = `${diaDaSemana(inicio)} ${S.curto(inicio)} – ${diaDaSemana(fim)} ${S.curto(fim)}`;

  // Os atalhos acendem quando a semana escolhida é a deles.
  const passada = S.segundaPassada();
  document.querySelectorAll('.chip[data-recuar]').forEach((c) => {
    c.classList.toggle('on', S.maisDias(passada, -Number(c.dataset.recuar)) === inicio);
  });

  // O atraso da Via Verde, com as datas já calculadas — agora num selo na
  // própria linha da Via Verde, em vez de um parágrafo.
  const vv = S.semanaDoPortal(estado.semana, true);
  $('semana-atraso').textContent =
    `Para fechar ${S.curto(inicio)} a ${S.curto(fim)}, à Via Verde pede-se `
    + `${S.curto(vv.inicio)} a ${S.curto(vv.fim)} — ela publica com 4 a 5 dias de atraso.`;

  $('portal').innerHTML = portalAtual
    ? `Está em <i>${esc(nomeDoPortal(portalAtual))}</i>`
    : 'Fora dos portais';

  // ── Concluído ────────────────────────────────────────────────────────────
  if (sucesso) {
    desenharPassos(5);
    $('semana-trabalho').hidden = true;
    $('semana-sucesso').hidden = false;
    desenharSucesso();
    return;
  }
  $('semana-trabalho').hidden = false;
  $('semana-sucesso').hidden = true;

  // Duas voltas de relógio da recolha mais lenta. Passado isso, o worker
  // morreu algures e o botão tem de voltar a destrancar-se sozinho.
  const PRESO = 120_000;
  const aDecorrer = Boolean(estado.aDecorrer)
    && Date.now() - (estado.aDecorrerDesde ?? 0) < PRESO;

  // ── A lista dos cinco portais ────────────────────────────────────────────
  //
  // Três tipos de linha:
  //   · a do portal que está aberto — abre-se num cartão com o que a extensão
  //     vai fazer e o botão "Recolher desta página" (o mesmo nome que as
  //     mensagens de erro usam);
  //   · a do PRÓXIMO portal sugerido (o primeiro em falta) — com o "Abrir ↗"
  //     em destaque, para nunca haver dúvida sobre o que fazer a seguir;
  //   · as outras — só o estado e um "Abrir ↗" discreto.
  const btnRecolher = $('semana-recolher');
  const lista = $('semana-lista');
  const situacoes = PORTAIS.map((p) => situacaoDe(p.fonte));
  const feitos = situacoes.filter(Boolean).length;
  const emFalta = PORTAIS.filter((_, i) => !situacoes[i]);
  const aquiPorRecolher = Boolean(portalAtual) && !situacaoDe(portalAtual);
  const proximo = aquiPorRecolher ? null : (emFalta[0]?.fonte ?? null);
  const daSemana = `${S.curto(inicio)} a ${S.curto(fim)}`;
  const mesmoSiteDaPrio = (fonte) =>
    (fonte === 'PRIO_ELECTRIC' && portalAtual === 'PRIO_FROTA')
    || (fonte === 'PRIO_FROTA' && portalAtual === 'PRIO_ELECTRIC');

  /** O que a extensão faz em cada portal, dito antes de se carregar. */
  const oQueFaz = (fonte) => ({
    VIA_VERDE: `Ponho o filtro em ${S.curto(vv.inicio)} a ${S.curto(vv.fim)} (a semana anterior — a Via Verde publica com atraso) e descarrego o PDF.`,
    PRIO_FROTA: `Ponho o filtro em ${daSemana} e descarrego o PDF do combustível.`,
    PRIO_ELECTRIC: `Ponho o filtro em ${daSemana} e descarrego o PDF dos carregamentos.`,
    UBER: `Tento pôr ${daSemana} no filtro e leio a tabela. A Uber mostra até ${S.curto(S.maisDias(fim, 1))}: é normal, a semana dela acaba segunda de madrugada.`,
    BOLT: `Tento pôr ${daSemana} no filtro e leio a tabela por motorista.`,
  }[fonte] ?? '');

  let botaoColocado = false;
  const linhas = PORTAIS.map((p, i) => {
    const sit = situacoes[i];
    const aqui = portalAtual === p.fonte;
    const corre = aDecorrer && estado.aDecorrer === p.fonte;
    const eProximo = p.fonte === proximo;

    const item = document.createElement('div');
    item.className = `item${aqui ? ' aqui' : ''}${eProximo ? ' proximo' : ''}`;

    const ic = document.createElement('div');
    ic.className = `ic ${corre ? 'corre' : sit ? (sit.vazio ? 'zero' : 'ok') : aqui ? 'aqui' : 'falta'}`;
    ic.textContent = !corre && sit ? '✓' : '';

    const txt = document.createElement('div');
    txt.className = 'txt';
    const nome = document.createElement('div');
    nome.className = 'nome';
    nome.textContent = p.nome;
    if (p.fonte === 'VIA_VERDE') {
      const selo = document.createElement('span');
      selo.className = 'selo';
      selo.textContent = `${S.curto(vv.inicio)} – ${S.curto(vv.fim)}`;
      selo.title = 'A Via Verde publica com 4 a 5 dias de atraso: pede-se a semana anterior.';
      nome.append(' ', selo);
    }
    if (aqui || eProximo) {
      const marca = document.createElement('span');
      marca.className = aqui ? 'marca-aqui' : 'marca-proximo';
      marca.textContent = aqui ? 'Está aqui' : 'Próximo';
      nome.append(' ', marca);
    }
    const det = document.createElement('div');
    det.className = `det${sit && !corre ? ' feito' : ''}`;
    det.textContent = corre ? 'A recolher…'
      : sit ? (sit.vazio ? 'Sem movimentos — 0 € · conta como feito' : sit.texto)
      : aqui ? 'Falta recolher'
      : mesmoSiteDaPrio(p.fonte) ? 'Mesmo site, outra página — o Abrir ↗ leva lá'
      : eProximo ? `${p.det} · abra e inicie sessão`
      : p.det;
    txt.append(nome, det);

    const acao = document.createElement('div');
    acao.className = 'acao';

    if (aqui && sit && !corre) {
      // Já recolhido: a linha fica compacta, para o destaque ir para o próximo.
      btnRecolher.textContent = 'Recolher de novo';
      btnRecolher.className = 'btn-mini';
      btnRecolher.disabled = aDecorrer;
      btnRecolher.hidden = false;
      acao.append(btnRecolher);
      botaoColocado = true;
      item.append(ic, txt, acao);
      return item;
    }

    if (aqui) {
      // O cartão do portal aberto: o que vai acontecer, e o botão por baixo.
      const mais = document.createElement('div');
      mais.className = 'mais';
      const explica = document.createElement('p');
      explica.className = 'explica';
      explica.textContent = corre
        ? 'Pode levar até um minuto. Se esta janela se fechar, volte a abri-la: o resultado fica guardado.'
        : estado.ultimoErro
            ? 'Se apareceu uma mensagem em cima, siga o que ela diz e carregue outra vez.'
            : oQueFaz(p.fonte);
      // O botão de recolher é sempre o mesmo elemento — muda-se de sítio,
      // não se recria, para não perder o que está ligado a ele.
      btnRecolher.textContent = corre ? 'A recolher…' : 'Recolher desta página';
      btnRecolher.className = 'principal';
      btnRecolher.disabled = aDecorrer;
      btnRecolher.hidden = false;
      mais.append(explica, btnRecolher);
      botaoColocado = true;
      item.append(ic, txt, mais);
      return item;
    }

    const abrir = document.createElement('button');
    abrir.className = eProximo ? 'btn-mini ver' : sit ? 'btn-mini suave' : 'btn-mini';
    abrir.textContent = 'Abrir ↗';
    abrir.title = `Abrir ${p.nome} num separador novo`;
    abrir.addEventListener('click', () => abrirSeparador(p.url));
    acao.append(abrir);

    item.append(ic, txt, acao);
    return item;
  });
  if (!botaoColocado) {
    btnRecolher.hidden = true;
    lista.after(btnRecolher);
  }
  lista.replaceChildren(...linhas);

  // ── Como se faz (só enquanto não há nada recolhido) ─────────────────────
  const como = $('semana-como');
  // Só antes de começar, e fora dos portais: lá dentro, o cartão do portal
  // já diz o que fazer.
  como.hidden = feitos > 0 || Boolean(plano) || Boolean(portalAtual);
  como.innerHTML = `
    <h4>Como se recolhe</h4>
    <ol>
      <li><b>Abra o portal</b> com o botão <span class="tecla">Abrir ↗</span> e inicie sessão.</li>
      <li>Já nessa página, <b>abra esta extensão</b> outra vez.</li>
      <li>Carregue em <span class="tecla verde">Recolher desta página</span>. As datas são postas sozinhas.</li>
    </ol>
    <p>Repita nos 5 portais, pela ordem que quiser. O que recolher fica guardado.</p>`;

  // ── Progresso, com o que falta dito por nome ────────────────────────────
  //
  // Depois de analisar, o que interessa é o resultado: a lista dos portais
  // dobra-se numa linha, e abre-se de novo com um clique.
  const dobrada = Boolean(plano) && !verLista;
  lista.hidden = dobrada;
  const falta = emFalta.map((p) => p.nome).join(', ');
  if (plano) {
    $('semana-progresso').className = 'progresso dobra';
    $('semana-progresso').innerHTML =
      `<span class="${feitos === PORTAIS.length ? 'tudo' : ''}">${feitos === PORTAIS.length ? '✓ ' : ''}`
      + `${feitos} de ${PORTAIS.length} portais recolhidos</span>`
      + `<button class="ligacao" id="ver-lista">${dobrada ? 'Ver os portais' : 'Esconder'}</button>`;
    $('ver-lista').addEventListener('click', () => { verLista = !verLista; desenhar(portalAtual); });
  } else {
    $('semana-progresso').className = `progresso${feitos === PORTAIS.length ? ' completo' : ''}`;
    $('semana-progresso').innerHTML = feitos === PORTAIS.length
    ? '<span class="tudo">✓ Os 5 portais estão recolhidos</span>'
      + '<div class="trilho"><span style="width:100%"></span></div>'
    : `<div class="cima"><span><b>${feitos} de ${PORTAIS.length}</b> recolhidos</span>`
      + `<div class="trilho"><span style="width:${Math.round((feitos / PORTAIS.length) * 100)}%"></span></div></div>`
      + (feitos > 0 ? `<small>Falta: ${esc(falta)}</small>` : '');
  }

  // ── Analisar e criar ─────────────────────────────────────────────────────
  const temAlgo = Object.keys(estado.recolhido).length > 0
    || Object.keys(estado.ganhos ?? {}).length > 0;
  const analisar = $('semana-analisar');
  analisar.disabled = !temAlgo;
  analisar.textContent = plano
    ? 'Analisar de novo'
    : feitos === PORTAIS.length ? 'Analisar' : 'Analisar o que já tenho';
  analisar.className = !plano && feitos === PORTAIS.length ? 'principal' : 'secundario';

  // Só destranca havendo um plano COM linhas por criar, e com todas as
  // leituras a conferir. O servidor recusa na mesma; aqui evita-se o clique
  // que não ia dar em nada.
  const porCriarAgora = (plano?.linhas ?? []).filter((l) => !l.bloqueio).length;
  const naoConfere = (plano?.fontes ?? []).some((f) => f.presente && !f.confere);
  const criar = $('semana-criar');
  criar.hidden = !plano;
  criar.disabled = !plano || porCriarAgora === 0 || naoConfere;
  criar.textContent = porCriarAgora > 0
    ? `Criar ${plural(porCriarAgora, 'rascunho', 'rascunhos')}`
    : 'Criar rascunhos';

  // ── O botão de forçar ────────────────────────────────────────────────────
  //
  // Aparece sempre que houver um plano com problemas: uma leitura que não
  // confere, ou um plano sem nada para criar apesar de haver material.
  // Existe porque a recusa sozinha era um beco: uma semana sem abastecimentos
  // faz o leitor dizer "não encontrei nada", que é indistinguível de um
  // ficheiro mal lido.
  const algoMal = plano && (naoConfere || porCriarAgora === 0);
  $('semana-forcar').hidden = !algoMal;

  $('semana-dica').textContent = plano
    ? (porCriarAgora > 0 && !naoConfere
      ? 'Criar não credita nada: os rascunhos ficam na Faturação para confirmar.'
      : '')
    : feitos === PORTAIS.length
      ? 'Passo seguinte: Analisar mostra o que vai ser criado, sem gravar nada.'
      : feitos > 0
        ? 'Pode analisar já o que tem, para ver como está a ficar. Analisar não grava nada.'
        : '';

  desenharPassos(plano || feitos === PORTAIS.length ? 3 : 2);
  // Com o plano à vista, o "Analisar de novo" desce para o fim (só CSS).
  $('semana-trabalho').classList.toggle('com-plano', Boolean(plano));

  // ── Limpar só o que veio DESTA página (no menu "Mais opções") ────────────
  const limparPagina = $('semana-limpar-pagina');
  const temParaLimpar = portalAtual && (
    estado.recolhido[portalAtual]
    || ((portalAtual === 'UBER' || portalAtual === 'BOLT')
        && Object.values(estado.ganhos ?? {}).some(
          (g) => (portalAtual === 'UBER' ? g.uberAmount : g.boltAmount) !== undefined))
  );
  limparPagina.hidden = !temParaLimpar;
  if (temParaLimpar) limparPagina.textContent = `Limpar só ${nomeDoPortal(portalAtual)}`;

  desenharPlano();
}

function desenharPlano() {
  // As caixas de escolha vivem fora do bloco do plano, e são redesenhadas
  // sempre: um nome que passou a ter dono tem de deixar de aparecer aqui.
  void desenharEmparelhar();

  const alvo = $('semana-plano');
  const veredito = $('semana-veredito');
  if (!plano) {
    alvo.hidden = true; alvo.innerHTML = '';
    veredito.hidden = true; veredito.innerHTML = '';
    return;
  }
  alvo.hidden = false;

  const linhas = plano.linhas ?? [];
  const porCriar = linhas.filter((l) => !l.bloqueio);
  const bloqueadas = linhas.filter((l) => l.bloqueio);
  const nomes = (plano.naoEmparelhados ?? []).length;
  const avisos = plano.avisos ?? [];
  const fontes = (plano.fontes ?? []).filter((f) => f.presente);
  const mas = fontes.filter((f) => !f.confere);
  const semDono = Number(plano.porAtribuir) || 0;

  // ── O veredito: uma frase que diz se dá para criar, e o que fazer ───────
  const urlDaFonte = (nome) => PORTAIS.find((p) => p.nome === nome)?.url ?? null;
  if (mas.length) {
    const m = mas[0];
    const declarado = Number.isFinite(Number(m.totalDeclarado)) && m.totalDeclarado !== null
      ? ` mas o documento diz ${eur(m.totalDeclarado)}` : '';
    veredito.className = 'veredito mau';
    veredito.innerHTML = `
      <b>✕ Ainda não dá para criar</b>
      <p>O PDF da ${esc(m.nome)} foi lido com ${eur(m.totalLido)}${esc(declarado)}. Volte a esse portal e carregue em <i>Recolher de novo</i>; depois, <i>Analisar de novo</i>.</p>
      ${urlDaFonte(m.nome) ? '<button class="btn-mini" id="veredito-abrir">Abrir ' + esc(m.nome) + ' ↗</button>' : ''}`;
    $('veredito-abrir')?.addEventListener('click', () => abrirSeparador(urlDaFonte(m.nome)));
  } else if (!porCriar.length) {
    veredito.className = 'veredito aten';
    veredito.innerHTML = `
      <b>Não há rascunhos para criar</b>
      <p>${linhas.length ? 'Todos os motoristas lidos já têm fecho nesta semana.' : 'Com o que foi recolhido, não encontrei nenhum motorista com valores nesta semana.'} Veja os detalhes em baixo.</p>`;
  } else {
    veredito.className = 'veredito bom';
    const extra = [
      nomes ? `Opcional: ${nomes === 1 ? 'há um nome' : `há ${nomes} nomes`} por reconhecer, logo abaixo.` : '',
      avisos.length || semDono ? 'No fim há lembretes para tratar à mão — não impedem nada.' : '',
    ].filter(Boolean);
    veredito.innerHTML = `
      <b>✓ Pronto para criar ${esc(plural(porCriar.length, 'rascunho', 'rascunhos'))}</b>
      <p>Confira a lista e carregue em <i>Criar</i>, no fim.</p>
      ${extra.map((t) => `<p class="extra">${esc(t)}</p>`).join('')}`;
  }
  veredito.hidden = false;

  // ── As linhas, com ganhos e despesas separados ──────────────────────────
  const valores = (pares) => pares.filter(([, v]) => Number(v) > 0)
    .map(([r, v]) => `${r} <b>${eur(v)}</b>`).join(' · ');
  const linhaDe = (l) => {
    const ganhos = valores([['Uber', l.uberAmount], ['Bolt', l.boltAmount]]);
    const despesas = valores([['Portagens', l.tollsAmount], ['Combustível', l.fuelAmount], ['Carregamento', l.chargeAmount]]);
    return `
      <div class="pessoa">
        <div class="quem"><span>${esc(l.userName)}</span>${l.plate && l.plate !== '—' ? `<span class="matricula">${esc(l.plate)}</span>` : '<span class="matricula falta">sem carro</span>'}</div>
        ${ganhos ? `<div class="vals"><span class="rot g">Ganhos</span>${ganhos}</div>` : ''}
        <div class="vals"><span class="rot d">Despesas</span>${despesas || '<span class="nada">nenhuma lida</span>'}</div>
      </div>`;
  };

  const tratar = [
    ...(semDono > 0 ? [`${eur(semDono)} de despesas sem carro ou motorista — não entram em nenhum rascunho.`] : []),
    ...avisos,
  ];

  const leitura = fontes.length
    ? (mas.length
      ? `<div class="caixa"><h4>Leitura dos PDFs</h4>${fontes.map((f) => `<div class="linha"><span>${esc(f.nome)}</span><span class="val ${f.confere ? 'ok' : 'mal'}">${eur(f.totalLido)} ${f.confere ? '✓ bate certo' : '✕ não bate'}</span></div>`).join('')}</div>`
      : `<p class="leitura-ok">✓ PDFs lidos e totais a bater certo: ${fontes.map((f) => `${esc(f.nome)} ${eur(f.totalLido)}`).join(' · ')}</p>`)
    : '';

  alvo.innerHTML = `
    ${porCriar.length ? `<div class="caixa">
      <h4>Vão ser criados <span class="conta">${porCriar.length}</span></h4>
      ${porCriar.map(linhaDe).join('')}
    </div>` : ''}
    ${bloqueadas.length ? `<div class="caixa calma">
      <h4>Não vão ser criados <span class="conta">${bloqueadas.length}</span></h4>
      ${bloqueadas.map((l) => `<div class="linha bloq"><span>${esc(l.userName)}<small>${esc(l.bloqueio)}</small></span></div>`).join('')}
    </div>` : ''}
    ${tratar.length ? `<div class="caixa">
      <h4>Para tratar à mão, na Faturação <span class="conta aten">${tratar.length}</span></h4>
      <p class="nota">Não impede a criação. Fica só como lembrete.</p>
      <ul class="av">${tratar.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
    </div>` : ''}
    ${leitura}`;
}

// ─────────────────────────────────────────────────────────────────────────────

async function recolher() {
  aviso('');
  estado.ultimoErro = null;
  $('semana-recolher').disabled = true;
  try {
    const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
    const portal = S.portalDe(aba?.url ?? '');
    if (!portal) throw new Error('Esta página não é nenhum dos portais.');

    if (portal === 'UBER' || portal === 'BOLT') {
      await recolherGanhos(aba.id, portal);
      // Recolher alguma coisa nova invalida o plano: o que está no ecrã deixou
      // de corresponder ao que seria criado.
      plano = null;
      await S.gravarEstado(estado);
      desenhar(portal);
      return;
    }

    // Daqui para a frente quem trabalha é o service worker. Este popup pode
    // fechar-se a qualquer momento — o download do relatório costuma tirar-lhe
    // o foco — e o resultado aparece na mesma, guardado, da próxima vez que se
    // abrir. Não se espera pela resposta por isso mesmo.
    S.pedirRecolha(portal, estado.semana).catch(() => { /* o worker guarda o erro */ });
    estado.aDecorrer = portal;
    await S.gravarEstado(estado);
    desenhar(portal);
  } catch (e) {
    aviso(e.message, 'mau');
  } finally {
    $('semana-recolher').disabled = false;
  }
}

/**
 * Uber e Bolt: põe as datas, lê a tabela, e CONFERE o período.
 *
 * ─── A ORDEM IMPORTA ───────────────────────────────────────────────────────
 *
 * Primeiro tenta-se preencher o filtro. Pode não dar: estes dois portais usam
 * seletores de intervalo desenhados à mão, e esses não se preenchem escrevendo
 * como os campos normais da Prio. Não faz mal — não é por aí que isto é
 * seguro.
 *
 * O que torna isto seguro é o passo final: comparar o período que a PÁGINA
 * MOSTRA com a semana que se está a fechar, e recusar quando não bate. Lançar
 * os ganhos de uma semana dentro de outra é o erro que ninguém apanharia
 * depois — os números são plausíveis, as contas fecham, e só se descobre
 * quando o motorista reclamar.
 */
async function recolherGanhos(tabId, portal) {
  // ── A Bolt tem caminho próprio, no mundo isolado ─────────────────────────
  //
  // É o mesmo código que o diagnóstico usa para abrir o menu, e esse nunca
  // falhou. Manter uma segunda versão no `recolha.js`, no mundo principal,
  // dava duas cópias da mesma ideia — e eu a corrigir a que não está a correr.
  if (portal === 'BOLT') {
    await chrome.scripting.executeScript({
      target: { tabId }, files: ['src/extract.js', 'src/adapters.js'],
    });
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sem) => window.__dragonfleetPorSemanaBolt(sem),
      args: [estado.semana],
    });
    const resultado = r?.result;
    if (resultado && !resultado.ok) {
      throw new Error(
        `Não consegui pôr a semana no filtro da Bolt.\n\n`
        + `Por onde passou: ${(resultado.rasto ?? []).join(' › ')}`,
      );
    }
    return lerTabelaDeGanhos(tabId, portal);
  }

  // 1. Tentar pôr as datas. Corre no mundo principal, como a recolha dos PDFs.
  await chrome.scripting.executeScript({
    target: { tabId }, world: 'MAIN', files: ['src/recolha.js'],
  });
  // O RESULTADO É LIDO.
  //
  // Antes era deitado fora: a extensão tentava pôr as datas, falhava, e seguia
  // para a leitura como se nada fosse. Do lado de fora isso aparecia como "não
  // deu" — sem mensagem, sem pista, sem nada para corrigir.
  const [datas] = await chrome.scripting.executeScript({
    target: { tabId }, world: 'MAIN',
    func: (sem) => window.__dragonfleetDatasGanhos(sem),
    args: [estado.semana],
  });
  const comoCorreu = datas?.result;
  if (comoCorreu && comoCorreu.ok === false) {
    throw new Error(
      `${comoCorreu.erro}\n\nPor onde passou: ${(comoCorreu.registo ?? []).join(' › ') || '(nada)'}`,
    );
  }

  return lerTabelaDeGanhos(tabId, portal);
}

/** Lê a tabela de ganhos e confere o período. Comum à Uber e à Bolt. */
async function lerTabelaDeGanhos(tabId, portal) {
  // Os DOIS ficheiros: o `__dragonfleetExtrair` vive no adapters.js e sem ele
  // a chamada abaixo não encontrava função nenhuma.
  await chrome.scripting.executeScript({
    target: { tabId }, files: ['src/extract.js', 'src/adapters.js'],
  });
  const [resultado] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__dragonfleetExtrair(),
  });

  const r = resultado?.result;
  if (!r || r.erro) throw new Error(r?.erro ?? 'Não consegui ler a tabela desta página.');
  if (!r.rows?.length) throw new Error('A tabela está vazia. Confirme o período no portal.');

  // 3. Conferir o período. É aqui que isto fica seguro.
  //
  // Na Uber o fim é a segunda SEGUINTE — o portal explica-o: a semana corre de
  // segunda às 04:00 à segunda seguinte às 03:59. Logo, para fechar 21 a 27,
  // o ecrã mostra 21/09 a 28/09, e exigir 27 fazia esta conferência recusar
  // precisamente o período certo.
  const fimEsperado = portal === 'UBER' ? S.maisDias(estado.semana.fim, 1) : estado.semana.fim;
  const p = r.periodo;
  if (p && (p.periodStart !== estado.semana.inicio || p.periodEnd !== fimEsperado)) {
    throw new Error(
      `A página mostra ${p.periodStart} a ${p.periodEnd} e a semana a fechar é `
      + `${estado.semana.inicio} a ${fimEsperado}.\n\n`
      + 'Acerte o período no portal e volte a carregar em Recolher. Não lancei nada.',
    );
  }
  if (!p) {
    aviso(
      'Não consegui ler o período desta página, por isso não o pude conferir. '
      + `Confirme no portal que está em ${estado.semana.inicio} a ${estado.semana.fim}.`,
    );
  }

  const campo = portal === 'UBER' ? 'uberAmount' : 'boltAmount';
  estado.ganhos = estado.ganhos ?? {};
  for (const linha of r.rows) {
    const nome = (linha.driverName ?? '').trim();
    if (!nome) continue;
    // A chave é o nome NORMALIZADO — ver a nota em semana.js. O nome original
    // vai à mesma no `driverName`, porque é esse que o servidor emparelha.
    const chave = S.chaveDoNome(nome);
    estado.ganhos[chave] = {
      driverName: estado.ganhos[chave]?.driverName ?? nome,
      ...(estado.ganhos[chave] ?? {}),
      [campo]: linha.amount ?? 0,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * A lista de motoristas do DragonFleet, para a caixa de escolha.
 *
 * Em cache enquanto o popup estiver aberto, e só pedida quando há mesmo um
 * nome por resolver: na maioria das semanas não há nenhum, e pedir a lista
 * sempre seria um pedido de rede a troco de nada.
 *
 * A rota `/users/all` existe para isto — devolve todos sem paginação, ao
 * contrário da que as telas usam, que devolve uma página de cada vez e
 * deixaria de fora precisamente o motorista que falta.
 */
let motoristasEmCache = null;

async function buscarMotoristas() {
  if (motoristasEmCache) return motoristasEmCache;

  const pedir = () => fetch(`${api.base}/users/all`, { headers: api.cabecalhos() });
  let res = await pedir();
  if (res.status === 401 && await api.renovarToken?.()) res = await pedir();

  const json = await api.respostaJson(res, api.base);
  if (!res.ok) throw new Error(json?.message ?? `Não consegui ir buscar os motoristas (HTTP ${res.status}).`);

  const users = (json?.data ?? json)?.users ?? [];
  motoristasEmCache = users
    .filter((u) => u?.id && u?.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  return motoristasEmCache;
}

/**
 * Desenha uma caixa de escolha por cada nome que ficou sem dono.
 *
 * Separado do resto do plano porque precisa da lista de motoristas, que vem da
 * rede: o plano aparece já, e as caixas aparecem um instante depois. O
 * contrário — esperar pela lista para mostrar fosse o que fosse — faria o
 * ecrã ficar em branco a seguir a um clique que correu bem.
 */
async function desenharEmparelhar() {
  const alvo = $('semana-emparelhar');
  const pendentes = plano?.naoEmparelhados ?? [];
  if (pendentes.length === 0) { alvo.hidden = true; alvo.innerHTML = ''; return; }

  alvo.hidden = false;
  alvo.innerHTML = `<h4>${pendentes.length === 1 ? 'Um nome que não reconheci' : `${pendentes.length} nomes que não reconheci`}</h4>`
    + '<p class="nota">Estes nomes vêm da Uber ou da Bolt e não batem com nenhum motorista. '
    + 'Escolha quem é e eu lembro-me nas próximas semanas. Se deixar em branco, o valor fica de fora.</p>';

  let motoristas;
  try {
    motoristas = await buscarMotoristas();
  } catch (e) {
    alvo.innerHTML += `<p class="aviso">${e.message}</p>`;
    return;
  }

  for (const p of pendentes) {
    const total = (p.uberAmount ?? 0) + (p.boltAmount ?? 0);
    const chave = S.chaveDoNome(p.driverName);

    const linha = document.createElement('div');
    linha.className = 'emparelhar-linha';

    const etiqueta = document.createElement('span');
    const deOnde = [
      p.uberAmount ? `Uber ${eur(p.uberAmount)}` : '',
      p.boltAmount ? `Bolt ${eur(p.boltAmount)}` : '',
    ].filter(Boolean).join(' · ') || eur(total);
    etiqueta.innerHTML = `<b>${esc(p.driverName)}</b> <span class="de-onde">${esc(deOnde)}</span>`;

    // Os parecidos (quando o servidor os manda) vão primeiro. A lista e os
    // valores são os mesmos de sempre; só muda a ordem em que aparecem.
    const parecidos = (p.candidatos ?? []).filter((c) => c?.id && c?.name);
    const opcao = (m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`;
    const caixa = document.createElement('select');
    caixa.innerHTML = '<option value="">— deixar de fora —</option>'
      + (parecidos.length
        ? `<optgroup label="Parecidos">${parecidos.map(opcao).join('')}</optgroup>`
          + `<optgroup label="Todos os motoristas">${motoristas.map(opcao).join('')}</optgroup>`
        : motoristas.map(opcao).join(''));
    caixa.value = estado.emparelhamentos?.[chave] ?? '';

    // Guardar e voltar a analisar. O plano muda — passa a haver mais um
    // rascunho — e o botão de criar só deve destrancar depois de o ecrã
    // mostrar o que vai ser criado.
    caixa.addEventListener('change', async () => {
      estado.emparelhamentos = { ...(estado.emparelhamentos ?? {}) };
      if (caixa.value) estado.emparelhamentos[chave] = caixa.value;
      else delete estado.emparelhamentos[chave];
      await S.gravarEstado(estado);
      await analisar();
    });

    linha.append(etiqueta, caixa);
    alvo.append(linha);
  }
}

async function chamar(caminho) {
  const pedir = async () => {
    const res = await fetch(`${api.base}${caminho}`, {
      method: 'POST',
      headers: api.cabecalhos(),
      body: JSON.stringify(S.corpoDoPedido(estado)),
    });
    return { res, json: await api.respostaJson(res, api.base) };
  };

  let { res, json } = await pedir();

  // ── Um 401 aqui quer dizer "o token expirou", não "entraste mal" ─────────
  //
  // O token de acesso dura 15 minutos e passar pelos cinco portais demora
  // mais. Renova-se e repete-se UMA vez, em silêncio — é o que o próprio site
  // faz. Antes isto rebentava com "token inválido" no fim de todo o trabalho
  // de recolha, e o botão de criar ficava bloqueado para sempre porque sem
  // análise não há plano.
  if (res.status === 401 && await api.renovarToken?.()) {
    ({ res, json } = await pedir());
  }

  if (!res.ok) throw new Error(json?.message ?? `O servidor recusou (HTTP ${res.status}).`);
  return json?.data ?? json;
}

async function analisar() {
  aviso('');
  $('semana-analisar').disabled = true;
  try {
    plano = await chamar('/fleet-import/analisar');
    // Uma fonte que não confere trava tudo do lado do servidor. Aqui só se
    // impede o clique, para não haver a experiência de carregar e não
    // acontecer nada.
    // (O aviso de "não confere" passou para o veredito do plano, por cima da
    // lista — ver desenharPlano.)
  } catch (e) {
    plano = null;
    aviso(e.message, 'mau');
  } finally {
    const portal = S.portalDe((await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.url ?? '');
    desenhar(portal);
  }
}

async function criar(forcado) {
  aviso('');
  $('semana-criar').disabled = true;
  $('semana-forcar').disabled = true;
  try {
    // O `forcar` vive no estado porque é o `corpoDoPedido` que monta o pedido.
    // Fica sempre limpo a seguir: forçar é uma decisão para UMA vez, não um
    // modo em que se entra e se esquece.
    estado.forcar = forcado === true;
    const r = await chamar('/fleet-import');
    estado.forcar = false;
    plano = r;

    const falhas = (r.falhas ?? []).map((f) => `${f.userName}: ${f.motivo}`).join(' | ');

    // ── Nada criado NÃO é um sucesso, e a recolha NÃO se apaga ─────────────
    //
    // Isto apagava sempre, criasse ou não. Quem carregasse e recebesse zero
    // perdia a recolha dos cinco portais e tinha de a refazer toda — por um
    // erro que nem era dele.
    //
    // E a mensagem dizia "0 rascunhos criados. Nada foi creditado", que se lê
    // como se tivesse corrido bem. A razão do zero está nos AVISOS, que nunca
    // chegavam a aparecer.
    if (!r.criados) {
      const motivos = (r.avisos ?? []).slice(0, 4).join('\n• ');
      aviso(
        'Não foi criado nenhum rascunho, e NÃO apaguei o que já tinha recolhido.\n\n'
        + (motivos ? `• ${motivos}` : 'O servidor não devolveu motivo nenhum.')
        + (falhas ? `\n\nFalhas: ${falhas}` : ''),
      );
      return;
    }

    // O sucesso tem ecrã próprio, com a ligação para a Faturação.
    sucesso = { criados: r.criados, ignorados: r.ignorados ?? 0, falhas };

    // Só agora se limpa. Deixar a recolha depois de criar convidaria a
    // carregar outra vez e a tentar criar a mesma semana duas vezes.
    estado.recolhido = {};
    estado.ganhos = {};
    plano = null;
    await S.gravarEstado(estado);
  } catch (e) {
    aviso(e.message, 'mau');
  } finally {
    const portal = S.portalDe((await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.url ?? '');
    desenhar(portal);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function iniciarSemana() {
  // A versão à vista, no cabeçalho.
  //
  // Vale mais do que parece: os ficheiros do popup são relidos a cada abertura,
  // mas o manifesto, o service worker e os módulos ficam em cache até a
  // extensão ser recarregada. Dá para ficar com metade do código novo e metade
  // velho sem dar por isso — e a passar tardes a testar correções que não estão
  // lá. Este número diz num relance o que está mesmo a correr.
  try {
    $('versao').textContent = `v${chrome.runtime.getManifest().version}`;
  } catch { /* sem manifesto não há número, e não é por isso que se para */ }

  estado = await S.lerEstado();

  const mudarSemana = async () => {
    const inicio = $('semana-de').value;
    estado.semana = { inicio, fim: $('semana-ate').value || S.maisDias(inicio, 6) };
    // Mudar a semana invalida tudo o que foi recolhido: os PDFs guardados são
    // de outro período, e enviá-los com as datas novas criaria fechos com as
    // despesas da semana errada — o engano exato que esta ferramenta existe
    // para evitar.
    estado.recolhido = {};
    plano = null;
    await S.gravarEstado(estado);
    const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
    desenhar(S.portalDe(aba?.url ?? ''));
  };

  // ── Escolher a semana ───────────────────────────────────────────────────
  //
  // Mudar a semana apaga o que foi recolhido (ver acima, é de propósito).
  // Por isso pergunta-se antes, quando há alguma coisa a perder.
  const podeMudar = () => {
    const quantos = Object.keys(estado.recolhido).length
      + (Object.keys(estado.ganhos ?? {}).length ? 1 : 0);
    if (!quantos) return true;
    const ok = confirm('Mudar a semana apaga o que já recolheu desta semana. Continuar?');
    if (!ok) {
      $('semana-de').value = estado.semana.inicio;
      $('semana-ate').value = estado.semana.fim;
    }
    return ok;
  };

  $('semana-de').addEventListener('change', async () => {
    if (!podeMudar()) return;
    $('semana-ate').value = S.maisDias($('semana-de').value, 6);
    await mudarSemana();
  });
  $('semana-ate').addEventListener('change', async () => {
    if (!podeMudar()) return;
    await mudarSemana();
  });
  $('semana-mudar').addEventListener('click', () => {
    $('semana-escolher').hidden = !$('semana-escolher').hidden;
    $('semana-atraso').hidden = $('semana-escolher').hidden;
  });
  document.querySelectorAll('.chip[data-recuar]').forEach((chip) => {
    chip.addEventListener('click', async () => {
      const inicio = S.maisDias(S.segundaPassada(), -Number(chip.dataset.recuar));
      if (inicio === estado.semana.inicio) { $('semana-escolher').hidden = true; $('semana-atraso').hidden = true; return; }
      if (!podeMudar()) return;
      $('semana-de').value = inicio;
      $('semana-ate').value = S.maisDias(inicio, 6);
      await mudarSemana();
      $('semana-escolher').hidden = true;
      $('semana-atraso').hidden = true;
    });
  });
  $('semana-recolher').addEventListener('click', recolher);
  $('semana-analisar').addEventListener('click', analisar);
  $('semana-criar').addEventListener('click', () => criar(false));
  $('semana-forcar').addEventListener('click', () => criar(true));
  $('semana-diagnostico').addEventListener('click', async () => {
    try {
      const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });

      // TUDO num só script, e no mundo isolado.
      //
      // A primeira versão disto pedia metade ao `recolha.js` no mundo
      // principal e metade aos adaptadores no isolado. A metade do mundo
      // principal vinha vazia e eu ficava a ver só o que já sabia — sem
      // perceber porquê, que é o pior sítio onde se pode estar quando se está
      // a diagnosticar outra coisa.
      //
      // O DOM é o MESMO nos dois mundos; só as variáveis de JavaScript é que
      // são separadas. Por isso a inspeção da página não precisa do mundo
      // principal para nada, e feita aqui não depende de mais nada carregar.
      await chrome.scripting.executeScript({
        target: { tabId: aba.id }, files: ['src/extract.js', 'src/adapters.js'],
      });

      const [saida] = await chrome.scripting.executeScript({
        target: { tabId: aba.id },
        func: async () => {
          const curto = (t, n = 60) => (t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
          const visivel = (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
          };

          const relatorio = { endereco: location.href.split('?')[0] };

          try {
            relatorio.campos = [...document.querySelectorAll('input, textarea')]
              .filter(visivel).slice(0, 25)
              .map((c) => ({
                type: c.type ?? '',
                valor: curto(c.value, 40),
                placeholder: curto(c.placeholder, 30),
                rotulo: curto(c.getAttribute('aria-label') ?? c.name ?? '', 30),
              }));

            const padraoIntervalo =
              /\d{2}\/\d{2}\/\d{4}[\s\S]*[-–][\s\S]*\d{2}\/\d{2}\/\d{4}|\d{1,2}\s+[A-Za-z]{3}[a-z]*\s*[-–]\s*\d{1,2}\s+[A-Za-z]{3}/;
            const etiqueta = [...document.querySelectorAll('button, [role="button"], a, div, span')]
              .filter(visivel)
              .find((el) => {
                const t = curto(el.textContent, 70);
                return t.length < 70 && padraoIntervalo.test(t);
              });
            relatorio.etiqueta = etiqueta
              ? { tag: etiqueta.tagName.toLowerCase(), texto: curto(etiqueta.textContent) }
              : null;

            relatorio.botoes = [...document.querySelectorAll('button, [role="button"], a')]
              .filter(visivel).map((b) => curto(b.textContent, 28))
              .filter((t) => t && t.length <= 28).slice(0, 40);

            relatorio.tabelas = document.querySelectorAll('table').length;
          } catch (e) {
            relatorio.erroAoInspecionar = String(e?.message ?? e);
          }

          // O relatório da contagem é pedido FORA daqui, ao mundo principal,
          // e colado neste objeto depois. Ver a nota em baixo.

          // ── Na Bolt, experimentar mesmo abrir o menu e contar o que deu ──
          //
          // Isto MEXE na página: abre o menu. É de propósito — descrever o
          // botão não chegou, e o que falta saber é se ele reage e a quê.
          if (location.hostname.includes('bolt.eu')) {
            const passos = [];
            const gatilhos = [...document.querySelectorAll(
              '[aria-haspopup="menu"], [aria-haspopup="listbox"], [aria-haspopup="true"]',
            )].filter(visivel);

            relatorio.gatilhos = gatilhos.map((g) => ({
              texto: curto(g.textContent, 24),
              tag: g.tagName.toLowerCase(),
              expandido: g.getAttribute('aria-expanded'),
            }));

            const g = gatilhos.find((x) => /today|last|custom|hoje|semana/i.test(x.textContent || ''))
                   ?? gatilhos[0];
            if (g) {
              const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
              const estado = () => g.getAttribute('aria-expanded');

              g.click();
              await esperar(500);
              passos.push({ tentativa: 'click', expandido: estado() });

              if (estado() !== 'true') {
                const o = { bubbles: true, cancelable: true, view: window };
                for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
                  try { g.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, o)); } catch {}
                }
                await esperar(500);
                passos.push({ tentativa: 'ponteiro', expandido: estado() });
              }

              if (estado() !== 'true') {
                g.focus?.();
                for (const key of ['Enter', 'ArrowDown']) {
                  g.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
                  await esperar(400);
                  passos.push({ tentativa: `tecla ${key}`, expandido: estado() });
                  if (estado() === 'true') break;
                }
              }

              relatorio.aberturaDoMenu = passos;
              relatorio.opcoesVisiveis = [...document.querySelectorAll(
                '[role="menuitem"], [role="option"], li, button',
              )].filter(visivel)
                .map((el) => curto(el.textContent, 20))
                .filter((t) => /today|last|custom|week|month|day/i.test(t))
                .slice(0, 12);
            }
          }

          // O teste do menu vive no adapters.js, que é injetado a cada uso e
          // por isso está sempre atualizado — ao contrário deste ficheiro.
          if (location.hostname.includes('bolt.eu') && window.__dragonfleetTesteMenu) {
            try { relatorio.menu = await window.__dragonfleetTesteMenu(); }
            catch (e) { relatorio.menu = { excecao: String(e?.message ?? e) }; }
          }

          try {
            const r = window.__dragonfleetExtrair();
            relatorio.adaptador = {
              erro: r.erro ?? null,
              periodoLido: r.periodo ?? null,
              quantasLinhas: r.rows?.length ?? 0,
              primeiras: (r.rows ?? []).slice(0, 3)
                .map((l) => ({ nome: curto(l.driverName, 20), valor: l.amount })),
            };
          } catch (e) {
            relatorio.adaptador = { excecao: String(e?.message ?? e) };
          }

          return relatorio;
        },
      });

      const relatorio = saida?.result ?? {};

      // ── O que o contador de movimentos vê ───────────────────────────────
      //
      // Pedido ao MUNDO PRINCIPAL e não reimplementado aqui: o diagnóstico só
      // serve se disser o que o código real faz. Uma segunda cópia da lógica
      // diria o que eu acho que ela faz — que é precisamente a informação que
      // não ajuda em nada.
      //
      // É a razão de isto ser um segundo `executeScript` em vez de ir dentro
      // do de cima: aquele corre no mundo isolado, onde o `recolha.js` não
      // existe.
      try {
        await chrome.scripting.executeScript({
          target: { tabId: aba.id }, world: 'MAIN', files: ['src/recolha.js'],
        });
        const [c] = await chrome.scripting.executeScript({
          target: { tabId: aba.id }, world: 'MAIN',
          func: () => window.__dragonfleetDiagnosticoContagem(),
        });
        relatorio.contagem = c?.result ?? null;
      } catch (e) {
        relatorio.contagem = { excecao: String(e?.message ?? e) };
      }

      await navigator.clipboard.writeText(JSON.stringify(relatorio, null, 1));
      aviso('Diagnóstico copiado. Cole-o na conversa.', 'bom');
    } catch (e) {
      aviso(`Não consegui recolher o diagnóstico: ${e.message}`, 'mau');
    }
  });

  /** Apaga só o que veio do portal da página aberta. */
  $('semana-limpar-pagina').addEventListener('click', async () => {
    const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
    const portal = S.portalDe(aba?.url ?? '');
    if (!portal) return;

    if (portal === 'UBER' || portal === 'BOLT') {
      // Os ganhos vivem por motorista, com a Uber e a Bolt lado a lado na
      // mesma entrada. Tira-se só a coluna deste portal; o motorista que ficar
      // sem nenhuma das duas desaparece, senão ficavam entradas fantasma a
      // contar para o total.
      const campo = portal === 'UBER' ? 'uberAmount' : 'boltAmount';
      const restantes = {};
      for (const [chave, g] of Object.entries(estado.ganhos ?? {})) {
        const { [campo]: _fora, ...resto } = g;
        if (resto.uberAmount !== undefined || resto.boltAmount !== undefined) {
          restantes[chave] = resto;
        }
      }
      estado.ganhos = restantes;
    } else {
      delete estado.recolhido[portal];
    }

    // O plano deixou de corresponder ao que está recolhido.
    plano = null;
    estado.ultimoErro = null;
    await S.gravarEstado(estado);
    desenhar(portal);
    aviso('');
  });

  $('semana-limpar').addEventListener('click', async () => {
    estado.recolhido = {}; estado.ganhos = {}; plano = null;
    estado.aDecorrer = null; estado.ultimoErro = null;
    await S.gravarEstado(estado);
    const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
    desenhar(S.portalDe(aba?.url ?? ''));
  });

  // O worker escreve o resultado no armazenamento. Ouvir aqui é o que faz o
  // ecrã atualizar-se sozinho quando a recolha acaba com o popup aberto — e o
  // que mostra o erro guardado quando ele acaba com o popup já fechado.
  chrome.storage.onChanged.addListener(async (mudancas, area) => {
    if (area !== 'local' || !mudancas[S.CHAVE]) return;
    estado = await S.lerEstado();
    const [atual] = await chrome.tabs.query({ active: true, currentWindow: true });
    desenhar(S.portalDe(atual?.url ?? ''));
    if (estado.ultimoErro) aviso(estado.ultimoErro, 'mau');
  });

  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  desenhar(S.portalDe(aba?.url ?? ''));
  if (estado.ultimoErro) aviso(estado.ultimoErro, 'mau');
}
