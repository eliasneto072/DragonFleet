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

function aviso(msg) {
  $('semana-erro').textContent = msg ?? '';
  $('semana-erro').hidden = !msg;
}

function desenhar(portalAtual) {
  const { inicio, fim } = estado.semana;
  $('semana-de').value = inicio;
  $('semana-ate').value = fim;

  // O atraso da Via Verde, com as datas já calculadas e à vista.
  const vv = S.semanaDoPortal(estado.semana, true);
  $('semana-atraso').textContent =
    `Para fechar ${S.curto(inicio)} a ${S.curto(fim)}, à Via Verde pede-se `
    + `${S.curto(vv.inicio)} a ${S.curto(vv.fim)} — ela publica com 4 a 5 dias de atraso.`;

  const linhas = Object.entries(S.FONTES).map(([fonte, cfg]) => {
    const r = estado.recolhido[fonte];
    const estaAqui = portalAtual === fonte;
    // "sem movimentos" e "recolhido" dizem coisas diferentes, e a diferença
    // importa: o primeiro afirma que a semana não teve despesa nenhuma neste
    // portal, e é por isso que não há PDF. Mostrar "recolhido" nos dois casos
    // deixava a dúvida de se o ficheiro se perdeu.
    const estadoTexto = r
      ? (r.vazio ? 'sem movimentos — 0 €' : 'recolhido')
      : (estaAqui ? 'nesta página' : 'em falta');
    return `<tr class="${estaAqui ? 'atual' : ''}">
      <td>${r ? '✓' : '·'}</td>
      <td>${cfg.rotulo}</td>
      <td class="direita">${estadoTexto}</td>
    </tr>`;
  });

  const nomes = Object.keys(estado.ganhos ?? {});
  const totalGanhos = Object.values(estado.ganhos ?? {})
    .reduce((s, g) => s + (g.uberAmount ?? 0) + (g.boltAmount ?? 0), 0);
  linhas.push(`<tr>
    <td>${nomes.length ? '✓' : '·'}</td>
    <td>Uber e Bolt</td>
    <td class="direita">${nomes.length
      ? `${nomes.length} motorista(s), ${eur(totalGanhos)}`
      : (portalAtual === 'UBER' || portalAtual === 'BOLT' ? 'nesta página' : 'em falta')}</td>
  </tr>`);

  $('semana-lista').innerHTML = linhas.join('');
  // Duas voltas de relógio da recolha mais lenta. Passado isso, o worker
  // morreu algures e o botão tem de voltar a destrancar-se sozinho.
  const PRESO = 120_000;
  const aDecorrer = Boolean(estado.aDecorrer)
    && Date.now() - (estado.aDecorrerDesde ?? 0) < PRESO;
  $('semana-recolher').disabled = !portalAtual || aDecorrer;
  $('semana-recolher').textContent = aDecorrer
    ? 'A recolher…'
    : (portalAtual ? 'Recolher desta página' : 'Abra um dos portais');

  const temAlgo = Object.keys(estado.recolhido).length > 0
    || Object.keys(estado.ganhos ?? {}).length > 0;
  $('semana-analisar').disabled = !temAlgo;
  // Só destranca havendo um plano COM linhas por criar. Antes bastava haver
  // plano, e dava para carregar com nada recolhido e receber um zero que
  // parecia avaria.
  const porCriarAgora = (plano?.linhas ?? []).filter((l) => !l.bloqueio).length;
  $('semana-criar').disabled = !plano || porCriarAgora === 0;

  // ── O botão de forçar ────────────────────────────────────────────────────
  //
  // Aparece sempre que houver um plano com problemas: uma leitura que não
  // confere, ou um plano sem nada para criar apesar de haver material.
  //
  // Existe porque a recusa sozinha era um beco. Uma semana sem abastecimentos
  // faz o leitor dizer "não encontrei nada", que é indistinguível de um
  // ficheiro mal lido — e travava o fecho inteiro sem saída.
  const algoMal = plano
    && ((plano.fontes ?? []).some((f) => f.presente && !f.confere) || porCriarAgora === 0);
  $('semana-forcar').hidden = !algoMal;

  // ── Limpar só o que veio DESTA página ────────────────────────────────────
  //
  // Refazer um portal não devia custar os outros quatro. O rótulo nomeia o
  // portal de propósito: "Limpar" sozinho, num popup que tem outro botão de
  // limpar, não diz o que vai desaparecer.
  const limparPagina = $('semana-limpar-pagina');
  const temParaLimpar = portalAtual && (
    estado.recolhido[portalAtual]
    || ((portalAtual === 'UBER' || portalAtual === 'BOLT')
        && Object.values(estado.ganhos ?? {}).some(
          (g) => (portalAtual === 'UBER' ? g.uberAmount : g.boltAmount) !== undefined))
  );
  limparPagina.hidden = !temParaLimpar;
  if (temParaLimpar) {
    const nome = S.FONTES[portalAtual]?.rotulo
      ?? (portalAtual === 'UBER' ? 'Uber' : 'Bolt');
    limparPagina.textContent = `Limpar só ${nome}`;
  }

  desenharPlano();
}

function desenharPlano() {
  // As caixas de escolha vivem fora do bloco do plano, e são redesenhadas
  // sempre: um nome que passou a ter dono tem de deixar de aparecer aqui.
  void desenharEmparelhar();

  if (!plano) { $('semana-plano').hidden = true; return; }
  $('semana-plano').hidden = false;

  const fontes = (plano.fontes ?? []).filter((f) => f.presente).map((f) =>
    `<li>${f.nome}: <strong>${eur(f.totalLido)}</strong> ${f.confere ? '✓' : '— NÃO CONFERE'}</li>`).join('');

  const porCriar = (plano.linhas ?? []).filter((l) => !l.bloqueio);
  const linhas = (plano.linhas ?? []).map((l) =>
    `<li${l.bloqueio ? ' class="bloqueado"' : ''}>${l.userName} (${l.plate}) —
      portagens ${eur(l.tollsAmount)}, combustível ${eur(l.fuelAmount)},
      carregamento ${eur(l.chargeAmount)}
      ${l.bloqueio ? `<br><em>${l.bloqueio}</em>` : ''}</li>`).join('');

  const avisos = (plano.avisos ?? []).map((a) => `<li>${a}</li>`).join('');

  $('semana-plano').innerHTML = `
    <h4>O que cada ficheiro disse</h4><ul>${fontes}</ul>
    <h4>Vai criar ${porCriar.length} rascunho(s)</h4><ul>${linhas}</ul>
    ${plano.porAtribuir > 0
      ? `<p class="aviso">${eur(plano.porAtribuir)} lidos e não atribuídos a ninguém.</p>` : ''}
    ${avisos ? `<h4>Para rever à mão</h4><ul class="avisos">${avisos}</ul>` : ''}`;
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
    aviso(e.message);
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
  alvo.innerHTML = '<h4>Nomes sem motorista</h4><p class="nota">Escolha a pessoa e o valor passa a ser lançado nela, esta semana e nas próximas.</p>';

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
    etiqueta.textContent = `${p.driverName} — ${eur(total)}`;

    const caixa = document.createElement('select');
    caixa.innerHTML = '<option value="">— ignorar este nome —</option>'
      + motoristas.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
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
    const má = (plano.fontes ?? []).find((f) => f.presente && !f.confere);
    if (má) aviso(`A leitura da ${má.nome} não confere. Nada vai ser criado até isso ficar resolvido.`);
  } catch (e) {
    plano = null;
    aviso(e.message);
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

    aviso(`${r.criados} rascunho(s) criado(s)${r.ignorados ? `, ${r.ignorados} ignorado(s)` : ''}. `
      + `Nada foi creditado — confirme na faturação. ${falhas}`);

    // Só agora se limpa. Deixar a recolha depois de criar convidaria a
    // carregar outra vez e a tentar criar a mesma semana duas vezes.
    estado.recolhido = {};
    estado.ganhos = {};
    plano = null;
    await S.gravarEstado(estado);
  } catch (e) {
    aviso(e.message);
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

  $('semana-de').addEventListener('change', async () => {
    $('semana-ate').value = S.maisDias($('semana-de').value, 6);
    await mudarSemana();
  });
  $('semana-ate').addEventListener('change', mudarSemana);
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
      aviso('Diagnóstico copiado. Cole-o na conversa.');
    } catch (e) {
      aviso(`Não consegui recolher o diagnóstico: ${e.message}`);
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
    if (estado.ultimoErro) aviso(estado.ultimoErro);
  });

  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  desenhar(S.portalDe(aba?.url ?? ''));
  if (estado.ultimoErro) aviso(estado.ultimoErro);
}
