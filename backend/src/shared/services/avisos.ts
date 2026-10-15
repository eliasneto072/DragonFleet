// src/shared/services/avisos.ts
//
// O ÚNICO sítio por onde um aviso sai do DragonFleet.
//
// ─── PORQUE É QUE ISTO EXISTE ───────────────────────────────────────────────
//
// Porque o site tinha vinte sítios a escrever notificações directamente na
// base de dados e só três a enviar email. O resultado era este: o fecho
// semanal aparecia no sininho e nunca no correio, o suporte não avisava
// ninguém, e a administração — literalmente — não recebia nada. Todas as
// notificações do sistema eram dirigidas a motoristas; não havia uma única
// linha de código a avisar um admin.
//
// Não foi decisão de ninguém. Foi crescendo assim, um `prisma.notification
// .create` de cada vez, e cada um deles saltava por cima do email sem que isso
// fosse visível em lado nenhum.
//
// A partir daqui há um caminho só. Quem quiser avisar alguém chama uma destas
// funções, e o aviso vai aos dois sítios. A guarda `verificar-avisos.mjs`
// recusa qualquer escrita directa fora daqui, para não voltar a acontecer.
//
// ─── O QUE ESTE MÓDULO GARANTE ──────────────────────────────────────────────
//
//  1. Um aviso NUNCA parte a operação que o gerou. Um fecho semanal que
//     falhe porque o servidor de email está em baixo seria absurdo: o dinheiro
//     está certo, o motorista é que não foi avisado. Tudo aqui apanha os seus
//     próprios erros e regista-os.
//
//  2. Ninguém recebe o mesmo aviso duas vezes. Quando a pessoa a avisar É da
//     gestão, o `avisarPessoaEGestao` não lhe manda duas cópias.
//
//  3. A frota é respeitada. As escritas passam pelo cliente com escopo, que
//     carimba `fleetId` sozinho — ver `escopo.ts`.
//
// ─── UMA ESCOLHA QUE CONVÉM SABER ───────────────────────────────────────────
//
// Quando o aviso nasce dentro de uma transação, a linha da notificação é
// escrita COM essa transação (é para isso que serve o parâmetro `cliente`),
// mas o email sai a seguir à escrita e não a seguir ao `commit`. Se a transação
// vier a falhar DEPOIS disso, o email já saiu.
//
// Fica assim de propósito. A alternativa — guardar os emails e enviá-los só
// depois do commit — obrigava todos os serviços a mudar de forma, e o mal que
// evita é pequeno: um aviso a mais sobre algo que não chegou a acontecer. O mal
// contrário, que é o que existe hoje, é não avisar de todo.

import { prisma } from '../../config/prisma';
import { UserRole } from '../types/enums';
import { emailService } from './email.service';

/** Um aviso: o que aparece no sininho é o mesmo que vai no email. */
export interface Aviso {
  titulo: string;
  mensagem: string;
}

/**
 * Um cliente do Prisma — o global ou o de uma transação.
 *
 * Está escrito à mão por não haver cliente gerado neste ambiente. Só precisa
 * das duas operações que este ficheiro usa.
 */
export interface ClienteDePrisma {
  notification: {
    create(args: { data: { userId: string; title: string; message: string } }): Promise<unknown>;
  };
  user: {
    findMany(args: unknown): Promise<{ id: string; name: string; email: string }[]>;
    findUnique(args: unknown): Promise<{ id: string; name: string; email: string } | null>;
  };
}

const global = prisma as unknown as ClienteDePrisma;

/** Onde o email leva quem clica. A gestão e o motorista vão a sítios diferentes. */
const DESTINO = {
  motorista: '/app/driver/notifications',
  gestao: '/app/admin/notifications',
} as const;

/**
 * Escreve a notificação e envia o email. Não atira nunca.
 *
 * Devolve o que correu bem, para quem quiser registar — mas ninguém é obrigado
 * a olhar, e é esse o ponto.
 */
async function entregar(
  pessoa: { id: string; name: string; email: string },
  aviso: Aviso,
  destino: string,
  cliente: ClienteDePrisma,
): Promise<{ noSite: boolean; porEmail: boolean }> {
  const resultado = { noSite: false, porEmail: false };

  try {
    await cliente.notification.create({
      data: { userId: pessoa.id, title: aviso.titulo, message: aviso.mensagem },
    });
    resultado.noSite = true;
  } catch (erro) {
    console.error(`[avisos] falhou a notificação no site para ${pessoa.id}:`, erro);
  }

  try {
    if (pessoa.email) {
      const envio = await emailService.sendNotification(
        pessoa.email, pessoa.name, aviso.titulo, aviso.mensagem, destino,
      );
      resultado.porEmail = envio.ok;
    }
  } catch (erro) {
    console.error(`[avisos] falhou o email para ${pessoa.id}:`, erro);
  }

  return resultado;
}

/**
 * Avisa uma pessoa: no site e por email.
 *
 * `cliente` só é preciso dentro de uma transação — passe-se o `tx` para a
 * notificação ficar presa à mesma transação que a operação que a gerou.
 */
export async function avisar(
  userId: string,
  aviso: Aviso,
  cliente: ClienteDePrisma = global,
): Promise<void> {
  try {
    const pessoa = await cliente.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    if (!pessoa) {
      console.warn(`[avisos] ignorado "${aviso.titulo}" — utilizador ${userId} não existe.`);
      return;
    }
    await entregar(pessoa, aviso, DESTINO.motorista, cliente);
  } catch (erro) {
    console.error(`[avisos] falhou "${aviso.titulo}" para ${userId}:`, erro);
  }
}

/**
 * Quem é a gestão desta frota.
 *
 * ADMIN e MANAGER. O SUPPORT fica de fora de propósito: vê o que precisa para
 * responder a um ticket, mas não é a ele que se pede uma decisão — e enchê-lo
 * de avisos sobre dinheiro era dar-lhe trabalho que não é dele.
 *
 * A frota vem do escopo do pedido, não de um argumento: o cliente do Prisma
 * filtra sozinho. Ver `escopo.ts`.
 */
async function gestaoDaFrota(cliente: ClienteDePrisma) {
  return cliente.user.findMany({
    where: {
      role: { in: [UserRole.ADMIN, UserRole.MANAGER] },
      status: 'ACTIVE',
    },
    select: { id: true, name: true, email: true },
  });
}

/**
 * Avisa a administração da frota.
 *
 * É isto que não existia. Suporte, pedidos de contacto, material de oficina,
 * pedidos de valor em falta — tudo isso chegava à base de dados e ficava à
 * espera de que alguém fosse lá ver.
 */
export async function avisarGestao(
  aviso: Aviso,
  cliente: ClienteDePrisma = global,
): Promise<void> {
  try {
    const gestores = await gestaoDaFrota(cliente);
    if (gestores.length === 0) {
      console.warn(`[avisos] "${aviso.titulo}" — nenhum admin activo nesta frota.`);
      return;
    }
    for (const g of gestores) {
      await entregar(g, aviso, DESTINO.gestao, cliente);
    }
  } catch (erro) {
    console.error(`[avisos] falhou "${aviso.titulo}" para a gestão:`, erro);
  }
}

/**
 * Avisa a pessoa E a administração, com textos diferentes.
 *
 * Os textos são diferentes porque o ponto de vista é diferente: ao motorista
 * diz-se «o teu fecho está disponível», à gestão diz-se «o fecho do João foi
 * publicado». Quem não distingue isso acaba a mandar à administração emails
 * escritos na segunda pessoa sobre a conta de outra pessoa.
 *
 * Se a pessoa avisada for ela própria da gestão — o dono da frota é motorista
 * e admin ao mesmo tempo — recebe só uma vez, a dela.
 */
export async function avisarPessoaEGestao(
  userId: string,
  paraPessoa: Aviso,
  paraGestao: Aviso,
  cliente: ClienteDePrisma = global,
): Promise<void> {
  await avisar(userId, paraPessoa, cliente);

  try {
    const gestores = await gestaoDaFrota(cliente);
    for (const g of gestores) {
      if (g.id === userId) continue; // já foi avisado em cima, como pessoa
      await entregar(g, paraGestao, DESTINO.gestao, cliente);
    }
  } catch (erro) {
    console.error(`[avisos] falhou "${paraGestao.titulo}" para a gestão:`, erro);
  }
}

/**
 * Avisa várias pessoas de uma vez, com o mesmo texto.
 *
 * Serve para os avisos gerais e para as tarefas automáticas, que correm sobre
 * listas. Cada pessoa é entregue por si: uma falha não trava as seguintes.
 */
export async function avisarVarios(
  userIds: string[],
  aviso: Aviso,
  cliente: ClienteDePrisma = global,
): Promise<void> {
  for (const id of [...new Set(userIds)]) {
    await avisar(id, aviso, cliente);
  }
}
