// extension/src/popup.js
//
// O fluxo da extensão: ler a página, PRÉ-VISUALIZAR, e só depois enviar.
//
// ─── A PRÉ-VISUALIZAÇÃO NÃO É OPCIONAL ───────────────────────────────────────
//
// O botão "Enviar" nasce desativado e só destranca depois de o servidor
// devolver a simulação. Não é cerimónia: a leitura da página pode falhar de
// maneiras silenciosas — um portal que mudou de aspeto, um nome que não
// emparelha, um período mal lido — e todas elas produzem um envio que parece
// ter corrido bem.
//
// Ver antes o que vai entrar, e quem ficou de fora, custa um segundo e evita
// descobrir o engano depois de os lançamentos estarem criados.

const $ = (id) => document.getElementById(id);
const guardar = (o) => chrome.storage.local.set(o);
const ler = (chaves) => chrome.storage.local.get(chaves);

let estado = { api: '', token: '', dados: null, previsto: null };

function erro(msg) {
  $('erro').textContent = msg;
  $('erro').hidden = !msg;
}

function eur(n) {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n);
}

// ─── Falar com o servidor ─────────────────────────────────────────────────────

/**
 * Pede ao Chrome autorização para falar com o endereço que a pessoa escreveu.
 *
 * O manifesto declara `optional_host_permissions` em vez de fixar o endereço da
 * API. É de propósito: em desenvolvimento a API está em localhost, na
 * demonstração num túnel do ngrok, depois no Render, e um dia num domínio .pt.
 * Cada um desses endereços escrito no manifesto obrigaria a editar o ficheiro e
 * a reinstalar a extensão em todas as máquinas.
 *
 * Assim, escreve-se o endereço no campo, o Chrome pergunta uma vez, e acabou.
 *
 * O pedido tem de partir de um clique — é a regra do Chrome para não haver
 * janelas de autorização a aparecer sozinhas. Por isso vive dentro do `entrar`
 * e não no arranque.
 */
async function pedirPermissao(api) {
  let origem;
  try {
    origem = `${new URL(api).origin}/*`;
  } catch {
    throw new Error('Endereço da API inválido. Inclua o https:// ou http://.');
  }

  if (await chrome.permissions.contains({ origins: [origem] })) return;

  const concedida = await chrome.permissions.request({ origins: [origem] });
  if (!concedida) {
    throw new Error(
      `Sem autorização para falar com ${origem}.\n\n` +
      'Sem ela o Chrome bloqueia os pedidos antes de saírem.',
    );
  }
}

/** Cabeçalhos comuns a todos os pedidos. */
function cabecalhos(comToken = true) {
  const h = {
    'Content-Type': 'application/json',
    // Um túnel gratuito do ngrok devolve uma página de aviso em HTML em vez da
    // resposta, na primeira visita de cada cliente. Este cabeçalho salta-a.
    // Fora do ngrok é ignorado, portanto não faz mal nenhum ficar sempre.
    'ngrok-skip-browser-warning': 'true',
  };
  if (comToken && estado.token) h.Authorization = `Bearer ${estado.token}`;
  return h;
}

/**
 * Lê a resposta, e diz algo útil quando ela não é JSON.
 *
 * `res.json()` cru rebenta com "Unexpected token <" quando o que volta é uma
 * página de HTML — o aviso do ngrok, um proxy pelo meio, ou o endereço apontado
 * ao frontend em vez da API. Essa mensagem não ajuda ninguém a perceber o que
 * fazer a seguir.
 */
async function respostaJson(res, api) {
  const texto = await res.text();
  try {
    return JSON.parse(texto);
  } catch {
    if (texto.trimStart().startsWith('<')) {
      throw new Error(
        'O servidor devolveu uma página de HTML em vez de dados.\n\n' +
        `Confirme que ${api} aponta para a API. Atrás de um nginx, o endereço ` +
        'termina em /api.',
      );
    }
    throw new Error(`Resposta ilegível do servidor (HTTP ${res.status}).`);
  }
}

// ─── Sessão ───────────────────────────────────────────────────────────────────

async function entrar() {
  erro('');
  const api = $('api').value.trim().replace(/\/$/, '');
  const email = $('email').value.trim();
  const password = $('password').value;

  if (!api || !email || !password) return erro('Preencha os três campos.');

  try {
    await pedirPermissao(api);

    const res = await fetch(`${api}/auth/login`, {
      method: 'POST',
      headers: cabecalhos(false),
      body: JSON.stringify({ email, password }),
    });
    const json = await respostaJson(res, api);
    if (!res.ok) throw new Error(json?.message ?? 'Não foi possível entrar.');

    const token = json.data?.token ?? json.token;
    const papel = json.data?.user?.role ?? json.user?.role;

    // A recolha é de gestão. Um motorista autenticado aqui receberia 403 do
    // servidor, mas dizer-lho já evita a viagem e a mensagem críptica.
    if (papel !== 'ADMIN' && papel !== 'MANAGER') {
      throw new Error('Esta conta não tem permissão para enviar rendimentos.');
    }

    estado = { ...estado, api, token };
    // A palavra-passe NÃO é guardada: fica só o token, que expira.
    await guardar({ api, token });
    mostrarRecolha();
  } catch (e) {
    erro(e.message);
  }
}

async function sair() {
  await chrome.storage.local.remove(['token']);
  estado.token = '';
  $('login').hidden = false;
  $('recolha').hidden = true;
  $('sair').hidden = true;
}

// ─── Leitura da página ────────────────────────────────────────────────────────

async function lerPagina() {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });

  // O código corre NA PÁGINA, não aqui: o popup não tem acesso ao DOM do
  // separador. `func` é serializada e executada lá dentro.
  const [resultado] = await chrome.scripting.executeScript({
    target: { tabId: aba.id },
    files: ['src/extract.js', 'src/adapters.js'],
  }).then(() => chrome.scripting.executeScript({
    target: { tabId: aba.id },
    func: () => window.__dragonfleetExtrair?.(),
  }));

  return resultado?.result ?? null;
}

// ─── Pré-visualização e envio ─────────────────────────────────────────────────

function desenhar(dados, previsto) {
  $('portal').textContent = dados.platform + (dados.simulacao ? ' · simulação' : '');
  $('avisos').replaceChildren();

  $('periodo').textContent = dados.periodo
    ? `${dados.periodo.periodStart} a ${dados.periodo.periodEnd}`
    : 'Período não identificado nesta página';

  const total = dados.rows.reduce((s, r) => s + (r.amount || 0), 0);
  $('resumo').textContent =
    `${dados.rows.length} motorista${dados.rows.length !== 1 ? 's' : ''} · ${eur(total)}`;

  $('linhas').innerHTML = dados.rows.slice(0, 12).map((r) => `
    <tr><td>${r.driverName}</td><td>${eur(r.amount || 0)}</td></tr>
  `).join('') + (dados.rows.length > 12
    ? `<tr><td colspan="2" style="color:#6b7280">…e mais ${dados.rows.length - 12}</td></tr>` : '');

  // Quem não emparelhou aparece SEMPRE, e é o que impede um envio cego.
  const soltos = previsto?.unmatched ?? [];
  if (soltos.length > 0) {
    $('porEmparelhar').hidden = false;
    $('porEmparelhar').innerHTML =
      `<strong>${soltos.length} sem correspondência</strong><br>` +
      soltos.slice(0, 5).map((u) =>
        `${u.driverName} — ${u.reason === 'ambiguous' ? 'nome repetido na frota' : 'não existe no DragonFleet'}`
      ).join('<br>') +
      (soltos.length > 5 ? `<br>…e mais ${soltos.length - 5}` : '') +
      '<br><br>Estes NÃO serão importados.';
  } else {
    $('porEmparelhar').hidden = true;
  }

  $('enviar').disabled = !previsto || !dados.periodo;
}

async function rever() {
  erro('');
  $('enviar').disabled = true;

  try {
    const dados = await lerPagina();
    if (!dados) throw new Error('Não consegui ler esta página.');
    if (dados.erro) throw new Error(dados.erro);
    if (dados.kind === 'EXPENSES') return await reverDespesas(dados);
    if (dados.rows.length === 0) throw new Error('Nenhum motorista encontrado na tabela.');

    estado.dados = dados;
    // Antes do pedido: se o servidor recusar, o erro aparece com o portal identificado.
    $('portal').textContent = dados.platform + (dados.simulacao ? ' · simulação' : '');

    if (!dados.periodo) {
      desenhar(dados, null);
      return erro(
        'Não identifiquei o período nesta página.\n\n' +
        'Escolha um intervalo de datas no portal — de segunda a domingo — e reveja outra vez.',
      );
    }

    const res = await fetch(`${estado.api}/earnings/ingest/preview`, {
      method: 'POST',
      headers: cabecalhos(),
      body: JSON.stringify({
        platform: dados.platform,
        periodStart: dados.periodo.periodStart,
        periodEnd: dados.periodo.periodEnd,
        rows: dados.rows.map((r) => ({ driverName: r.driverName, amount: r.amount })),
      }),
    });
    const json = await respostaJson(res, estado.api);
    if (!res.ok) throw new Error(json?.message ?? 'A simulação falhou.');

    estado.previsto = json.data?.result ?? json.result;
    desenhar(dados, estado.previsto);
  } catch (e) {
    erro(e.message);
  }
}

async function enviar() {
  erro('');
  $('enviar').disabled = true;
  if (estado.dados?.kind === 'EXPENSES') return enviarDespesas();

  try {
    const { dados } = estado;
    const res = await fetch(`${estado.api}/earnings/ingest`, {
      method: 'POST',
      headers: cabecalhos(),
      body: JSON.stringify({
        platform: dados.platform,
        periodStart: dados.periodo.periodStart,
        periodEnd: dados.periodo.periodEnd,
        rows: dados.rows.map((r) => ({ driverName: r.driverName, amount: r.amount })),
      }),
    });
    const json = await respostaJson(res, estado.api);
    if (!res.ok) throw new Error(json?.message ?? 'O envio falhou.');

    const r = json.data?.result ?? json.result;
    $('resumo').textContent =
      `${r.inserted} criados · ${r.skippedDuplicates} repetidos · ${r.unmatched.length} por emparelhar`;
    $('linhas').innerHTML =
      '<tr><td colspan="2">Enviado. Confira em Faturação › Por confirmar.</td></tr>';
  } catch (e) {
    erro(e.message);
    $('enviar').disabled = false;
  }
}

// ─── Despesas: Prio e Via Verde ───────────────────────────────────────────────
//
// O mesmo princípio dos ganhos — ler, pré-visualizar, só depois enviar — com
// três diferenças que mudam o que se mostra:
//
//   1. Não há período a escolher. Cada linha traz a sua data, e o servidor põe
//      cada uma na semana certa (a Via Verde na semana seguinte).
//   2. O que não emparelha NÃO se perde: grava-se sem motorista e fica na fila
//      para atribuir à mão. Nos ganhos, o que não emparelha não entra.
//   3. Há linhas que entram mas não se descontam — a mensalidade da Via Verde,
//      os cancelados. Mostram-se riscadas para se ver que foram lidas.
//
// Tudo o que vem da página é escrito com textContent e nunca com innerHTML: um
// nome de posto ou uma descrição de trajeto são texto de terceiros.

const NOME_FONTE = { PRIO: 'Prio', VIA_VERDE: 'Via Verde' };

function dataCurta(dia) {
  const [a, m, d] = String(dia).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function el(tag, props = {}, ...filhos) {
  const n = document.createElement(tag);
  Object.assign(n, props);
  for (const f of filhos) n.append(f);
  return n;
}

function aviso(texto, tipo = 'aviso') {
  $('avisos').append(el('div', { className: tipo, textContent: texto }));
}

async function pedirDespesas(rota, dados) {
  const res = await fetch(`${estado.api}${rota}`, {
    method: 'POST',
    headers: cabecalhos(),
    body: JSON.stringify({ source: dados.source, rows: dados.rows }),
  });
  const json = await respostaJson(res, estado.api);
  if (!res.ok) throw new Error(json?.message ?? 'O pedido falhou.');
  return json.data ?? json;
}

async function reverDespesas(dados) {
  if (dados.rows.length === 0) {
    throw new Error(
      'A tabela está vazia.\n\n' +
      (dados.source === 'PRIO'
        ? 'Escolha o INÍCIO e o FIM na pesquisa e carregue em Pesquisar.'
        : 'Abra o filtro, escolha as datas De e Até, e carregue em Filtrar.'),
    );
  }
  estado.dados = dados;
  estado.previsto = await pedirDespesas('/expenses/ingest/preview', dados);
  desenharDespesas(dados, estado.previsto);
}

function desenharDespesas(dados, s) {
  $('portal').textContent = NOME_FONTE[dados.source] + (dados.simulacao ? ' · simulação' : '');
  $('avisos').replaceChildren();

  // O intervalo que de facto se leu, e não o que o filtro diz.
  const dias = s.rows.map((r) => r.day).sort();
  $('periodo').textContent = dias.length
    ? `Movimentos de ${dataCurta(dias[0])} a ${dataCurta(dias[dias.length - 1])}` +
      (dados.source === 'VIA_VERDE' ? ' — descontam no fecho da semana seguinte' : '')
    : '';

  $('resumo').textContent =
    `${s.total} movimento${s.total !== 1 ? 's' : ''} · ${eur(s.chargeableTotal)} a descontar`;

  // Só parte da lista está no ecrã?
  const pag = dados.pagina;
  const soParte = !!dados.anunciadas && dados.anunciadas > dados.rows.length;
  if (soParte && pag && pag.ate >= pag.total && pag.de > 1) {
    aviso(
      `Última página: linhas ${pag.de} a ${pag.ate} de ${pag.total}. ` +
      'As páginas anteriores também têm de ser enviadas — se já o foram, ' +
      'o que se repetir não entra duas vezes.',
    );
  } else if (soParte && pag) {
    aviso(
      `Página com as linhas ${pag.de} a ${pag.ate} de ${pag.total}. ` +
      'Envie esta, passe à seguinte no portal e envie outra vez. ' +
      'O que se repetir não entra duas vezes.',
    );
  } else if (soParte) {
    aviso(
      `O portal diz ${dados.anunciadas}, esta página mostra ${dados.rows.length}. ` +
      'Envie todas as páginas do portal, uma de cada vez. ' +
      'O que se repetir não entra duas vezes.',
    );
  }

  // Conferência com o TOTAL da Prio.
  if (dados.totalPortal != null) {
    const lido = Math.round(s.rows.reduce((a, r) => a + r.amount, 0) * 100) / 100;
    if (soParte && Math.abs(lido - dados.totalPortal) > 0.01) {
      // Com várias páginas, o TOTAL do portal é o da pesquisa inteira: não
      // bater é o esperado, e não um sinal de linha perdida.
      aviso(
        `Esta página soma ${eur(lido)}. O TOTAL do portal (${eur(dados.totalPortal)}) ` +
        'inclui as outras páginas.',
        'certo',
      );
    } else if (Math.abs(lido - dados.totalPortal) > 0.01) {
      aviso(
        `A soma das linhas lidas (${eur(lido)}) não bate com o TOTAL do portal ` +
        `(${eur(dados.totalPortal)}). Alguma linha ficou de fora ou não se leu.`,
      );
    } else {
      aviso(`Bate com o TOTAL do portal: ${eur(dados.totalPortal)}.`, 'certo');
    }
  }

  if (s.invalid.length) {
    aviso(
      `${s.invalid.length} linha${s.invalid.length !== 1 ? 's' : ''} por ler — ` +
      s.invalid.slice(0, 3).map((i) => `linha ${i.index + 1}: ${i.reason}`).join('; ') +
      (s.invalid.length > 3 ? '…' : '') + '. Não serão gravadas.',
      'erro-leve',
    );
  }

  // As linhas.
  const corpo = s.rows.slice(0, 14).map((r) => {
    const quem = r.userName ?? '— por atribuir';
    const tr = el('tr', {},
      el('td', { textContent: quem, className: r.userId ? '' : 'solto' }),
      el('td', { textContent: r.plate ?? '', className: 'suave' }),
      el('td', { textContent: eur(r.amount) }),
    );
    if (!r.chargeable) {
      tr.className = 'nao-desconta';
      tr.title = r.category === 'FEE' ? 'Mensalidade — fica na empresa' : `Não desconta: ${r.statusText ?? ''}`;
    }
    return tr;
  });
  if (s.rows.length > 14) {
    corpo.push(el('tr', {}, el('td', { colSpan: 3, className: 'suave', textContent: `…e mais ${s.rows.length - 14}` })));
  }
  $('linhas').replaceChildren(...corpo);

  if (s.unmatched > 0) {
    $('porEmparelhar').hidden = false;
    $('porEmparelhar').replaceChildren(
      el('strong', { textContent: `${s.unmatched} sem motorista` }),
      el('br'),
      document.createTextNode(
        'Cartão e matrícula desconhecidos, ou carro sem ninguém atribuído nessa hora. ' +
        'Serão gravados na mesma e ficam na fila de Faturação para atribuir à mão.',
      ),
    );
  } else {
    $('porEmparelhar').hidden = true;
  }

  $('enviar').disabled = s.total === 0;
}

async function enviarDespesas() {
  try {
    const s = await pedirDespesas('/expenses/ingest', estado.dados);
    $('avisos').replaceChildren();
    $('resumo').textContent =
      `${s.inserted} novos · ${s.duplicates} já lá estavam · ${s.unmatched} por atribuir`;
    $('linhas').replaceChildren(el('tr', {}, el('td', {
      colSpan: 3,
      textContent: 'Enviado. Os valores aparecem no formulário do fecho de cada motorista.',
    })));
    $('porEmparelhar').hidden = true;
  } catch (e) {
    erro(e.message);
    $('enviar').disabled = false;
  }
}

// ─── Arranque ─────────────────────────────────────────────────────────────────

function mostrarRecolha() {
  $('login').hidden = true;
  $('recolha').hidden = false;
  $('sair').hidden = false;
  rever();
}

(async function inicio() {
  const guardado = await ler(['api', 'token']);
  $('api').value = guardado.api ?? 'http://localhost:3000';
  estado.api = guardado.api ?? '';
  estado.token = guardado.token ?? '';

  if (estado.token && estado.api) mostrarRecolha();
  else $('login').hidden = false;

  $('entrar').addEventListener('click', entrar);
  $('rever').addEventListener('click', rever);
  $('enviar').addEventListener('click', enviar);
  $('sair').addEventListener('click', sair);
})();
