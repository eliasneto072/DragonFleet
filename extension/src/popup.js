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

// ─── Sessão ───────────────────────────────────────────────────────────────────

async function entrar() {
  erro('');
  const api = $('api').value.trim().replace(/\/$/, '');
  const email = $('email').value.trim();
  const password = $('password').value;

  if (!api || !email || !password) return erro('Preencha os três campos.');

  try {
    const res = await fetch(`${api}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
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
  $('portal').textContent = dados.platform;

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
    if (dados.rows.length === 0) throw new Error('Nenhum motorista encontrado na tabela.');

    estado.dados = dados;

    if (!dados.periodo) {
      desenhar(dados, null);
      return erro(
        'Não identifiquei o período nesta página.\n\n' +
        'Escolha um intervalo de datas no portal — de segunda a domingo — e reveja outra vez.',
      );
    }

    const res = await fetch(`${estado.api}/earnings/ingest/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${estado.token}`,
      },
      body: JSON.stringify({
        platform: dados.platform,
        periodStart: dados.periodo.periodStart,
        periodEnd: dados.periodo.periodEnd,
        rows: dados.rows.map((r) => ({ driverName: r.driverName, amount: r.amount })),
      }),
    });
    const json = await res.json();
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

  try {
    const { dados } = estado;
    const res = await fetch(`${estado.api}/earnings/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${estado.token}`,
      },
      body: JSON.stringify({
        platform: dados.platform,
        periodStart: dados.periodo.periodStart,
        periodEnd: dados.periodo.periodEnd,
        rows: dados.rows.map((r) => ({ driverName: r.driverName, amount: r.amount })),
      }),
    });
    const json = await res.json();
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
