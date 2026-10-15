// scripts/verificar-avisos.mjs
//
// Guarda contra o que fez a administração nunca receber nada.
//
// ─── O QUE SE PASSAVA ───────────────────────────────────────────────────────
//
// O DragonFleet tinha vinte sítios a escrever notificações directamente na
// base de dados e três a enviar email. Quem escrevia directamente saltava o
// email sem que isso fosse visível em lado nenhum — nem no código, nem no
// ecrã, nem num erro.
//
// O resultado, à letra: o fecho semanal aparecia no sininho e nunca no
// correio; um pedido de suporte não avisava ninguém; e TODAS as notificações
// do sistema eram dirigidas a motoristas — não havia uma única linha de código
// a avisar um admin. O dono da frota nunca recebeu um email do seu próprio
// site, e durante meses ninguém soube porquê.
//
// ─── PORQUE É QUE UM GUIÃO E NÃO ATENÇÃO ────────────────────────────────────
//
// Porque isto não aconteceu por descuido de ninguém. Aconteceu um
// `prisma.notification.create` de cada vez, cada um deles perfeitamente
// razoável à sua frente, ao longo de meses. A atenção não escala a vinte
// sítios e dez meses; um guião escala.
//
// ─── O QUE ISTO VERIFICA ────────────────────────────────────────────────────
//
// Que ninguém escreve na tabela das notificações fora do `avisos.ts`. Quem
// quiser avisar alguém chama `avisar`, `avisarGestao`, `avisarPessoaEGestao`
// ou `avisarVarios` — e o aviso vai aos dois sítios, sempre.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Os únicos ficheiros com licença para escrever na tabela. */
const PERMITIDOS = [
  'src/shared/services/avisos.ts',
  // O repositório das notificações serve o painel (marcar como lida, listar)
  // e o envio à mão que um admin escreve. Esse passa pelo serviço, que já
  // manda email.
  'src/modules/notifications/notifications.repository.ts',
];

function ficheiros(dir) {
  const fora = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) fora.push(...ficheiros(p));
    else if (e.endsWith('.ts') && !e.endsWith('.test.ts')) fora.push(p);
  }
  return fora;
}

// Só a CRIAÇÃO. Marcar uma notificação como lida é um `updateMany` legítimo
// e não tem email nenhum a acompanhar — ver `investors.controller.ts`.
const escrita = /\b(?:prisma|tx|db|cliente)\s*\.\s*notification\s*\.\s*(create|createMany|upsert)\b/g;

const problemas = [];
let permitidas = 0;

for (const f of ficheiros('src')) {
  const normalizado = f.replace(/\\/g, '/');
  const temLicenca = PERMITIDOS.some((p) => normalizado.endsWith(p));
  const texto = readFileSync(f, 'utf8');

  for (const m of texto.matchAll(escrita)) {
    if (temLicenca) { permitidas++; continue; }
    problemas.push({
      ficheiro: normalizado,
      linha: texto.slice(0, m.index).split('\n').length,
      operacao: m[1],
    });
  }
}

if (problemas.length > 0) {
  console.error('');
  console.error('✗ Notificações escritas fora do `avisos.ts`:');
  console.error('');
  for (const p of problemas) {
    console.error(`  ${p.ficheiro}:${p.linha}  (notification.${p.operacao})`);
  }
  console.error('');
  console.error('  Uma notificação escrita assim aparece no sininho e NÃO manda');
  console.error('  email. Foi assim que a administração ficou meses sem receber');
  console.error('  nada e o fecho semanal nunca chegou ao correio de ninguém.');
  console.error('');
  console.error('  Use o ponto único — `src/shared/services/avisos.ts`:');
  console.error('');
  console.error('    await avisar(userId, { titulo, mensagem });        // uma pessoa');
  console.error('    await avisarGestao({ titulo, mensagem });          // os admins');
  console.error('    await avisarPessoaEGestao(userId, dela, deles);    // os dois');
  console.error('    await avisarVarios(ids, { titulo, mensagem });     // uma lista');
  console.error('');
  console.error('  Dentro de uma transação, passe o `tx` como último argumento.');
  console.error('');
  process.exit(1);
}

console.log(`✓ nenhuma notificação escrita fora do ponto único (${permitidas} no sítio certo)`);
