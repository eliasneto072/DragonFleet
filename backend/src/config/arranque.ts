// src/config/arranque.ts
//
// O que tem de estar verdadeiro para o sistema poder ser usado, conferido a
// cada arranque.
//
// ─── PORQUE É QUE ISTO NÃO É UMA MIGRAÇÃO ───────────────────────────────────
//
// Porque uma migração corre uma vez, no momento em que corre — e o momento
// certo para esta pergunta é depois de existir um administrador. Numa base de
// dados nova a ordem é: migrações, depois o seed do administrador. Uma migração
// a procurar administradores não encontrava nenhum e não fazia nada, e a base
// nova nascia sem dono para sempre.
//
// A cada arranque, a pergunta é feita outra vez. Custa uma contagem indexada e
// resolve-se sozinha no reinício seguinte.

import { prisma } from './prisma';
import { comoSistema } from './escopo';
import { UserRole } from '../shared/types/enums';

/**
 * Garante que a plataforma tem dono.
 *
 * ─── O PROBLEMA QUE ISTO RESOLVE ────────────────────────────────────────────
 *
 * A marca `is_owner` abre o painel da plataforma — a lista de frotas clientes,
 * os planos, as renovações. Sem ninguém a ter, esse painel fica inacessível a
 * toda a gente, e não há ecrã nenhum por onde entrar para o corrigir, porque o
 * ecrã que o corrigia também está trancado. É o mesmo beco sem saída que a
 * regra "o ADMIN tem tudo, sempre" existe para evitar nas permissões.
 *
 * Aconteceu a sério: a migração que criou as frotas ligou a marca a quem
 * estivesse marcado como `is_company`, e essa marca existia para as
 * estatísticas dos fechos — não para isto. Quem não a tinha ficou sem painel.
 *
 * ─── A REGRA, E PORQUE É QUE É SEGURA ───────────────────────────────────────
 *
 * Se NÃO existir nenhum dono, os administradores da PRIMEIRA frota passam a
 * sê-lo. Três condições, e as três importam:
 *
 *   - "nenhum dono" — basta existir um para isto nunca mais mexer em nada. Não
 *     promove ninguém num sistema que já está configurado;
 *   - "a primeira frota" — a mais antiga, que é a do dono da casa. É a mesma
 *     regra que o painel já usa para saber qual é a frota dele, e pela mesma
 *     razão: um id escrito no código era verdade nesta base de dados e mentira
 *     na seguinte. Uma frota cliente nasce sempre DEPOIS, por isso nunca pode
 *     tomar este lugar;
 *   - "administradores" — e não toda a gente dessa frota. Um motorista da casa
 *     não passa a ver a lista de clientes.
 *
 * O que isto NÃO faz é escolher alguém quando já há um dono, nem promover
 * ninguém de uma frota que não seja a primeira. Fora essas duas, não há caminho
 * nenhum daqui para a marca de dono.
 */
export async function garantirDono(): Promise<void> {
  await comoSistema(async () => {
    const donos = await prisma.user.count({ where: { isOwner: true } });
    if (donos > 0) return;

    const primeira = await prisma.fleet.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });
    if (!primeira) {
      // Sem frotas, as migrações ainda não correram. Dizê-lo é melhor do que
      // criar uma aqui às escondidas.
      console.warn('[arranque] Não existe nenhuma frota. As migrações já correram?');
      return;
    }

    const { count } = await prisma.user.updateMany({
      where: { fleetId: primeira.id, role: UserRole.ADMIN },
      data: { isOwner: true },
    });

    if (count === 0) {
      // A primeira frota ainda não tem administrador — numa base nova, o seed
      // corre a seguir a isto. No arranque seguinte a conta já existe e a
      // pergunta volta a ser feita.
      console.warn(
        `[arranque] A frota "${primeira.name}" ainda não tem administrador: `
        + 'a plataforma fica sem dono até haver um.',
      );
      return;
    }

    console.log(
      `[arranque] A plataforma não tinha dono. `
      + `${count} administrador(es) da frota "${primeira.name}" passaram a sê-lo.`,
    );
  });
}
