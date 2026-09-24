// src/modules/permissions/permissions.service.ts
//
// Quem pode ver e mexer em cada área do painel.
//
// ─── AS DUAS REGRAS QUE NÃO SE MEXEM ────────────────────────────────────────
//
// 1. O ADMIN tem tudo, sempre, e a tabela é ignorada para ele. Sem isto, uma
//    configuração errada tranca o dono fora do próprio sistema — e não há
//    ecrã nenhum por onde entrar para a corrigir, porque o ecrã que a corrige
//    também está trancado.
//
// 2. Sem linhas configuradas, vale o comportamento antigo do papel. É o que
//    faz este deploy não mudar nada para ninguém no dia em que entra. Basta
//    UMA área configurada para a configuração passar a mandar por inteiro:
//    misturar as duas coisas daria acessos que ninguém escolheu.
//
// ─── PORQUE É QUE NÃO ESTÁ NO TOKEN ─────────────────────────────────────────
//
// Seria mais rápido meter as permissões no JWT e não ir à base. Mas então
// tirar o acesso a alguém só faria efeito quando a sessão dele expirasse — e
// tirar o acesso a alguém é precisamente a operação que tem de fazer efeito
// agora. Uma consulta indexada por pedido é o preço disso.

import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/errors/AppError';
import { UserRole } from '../../shared/types/enums';
import {
  AREAS, PADRAO_DO_PAPEL, atLeast, type Access, type Area,
} from './permissions.catalog';

type Actor = { id: string; role?: UserRole };

export type Grants = Record<Area, Access>;

const TUDO = (nivel: Access): Grants =>
  Object.fromEntries(AREAS.map((a) => [a, nivel])) as Grants;

/** Quem é da equipa. Um motorista ou um investidor não passa por aqui. */
export function ehEquipa(role?: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.MANAGER || role === UserRole.SUPPORT;
}

export class PermissionsService {
  /**
   * O que esta pessoa pode fazer em cada área.
   *
   * Devolve sempre as dezasseis áreas preenchidas — nunca um mapa incompleto.
   * Quem chama não tem de se lembrar de tratar do caso "esta área não está no
   * mapa", que é exatamente o descuido que abre um acesso sem ninguém ver.
   */
  async grantsFor(userId: string, role?: UserRole): Promise<Grants> {
    if (role === UserRole.ADMIN) return TUDO('MANAGE');
    if (!ehEquipa(role)) return TUDO('NONE');

    const linhas = await prisma.staffPermission.findMany({ where: { userId } });

    if (linhas.length === 0) {
      // Nunca configurado: vale o que o papel dava antes.
      const padrao = PADRAO_DO_PAPEL[role ?? ''] ?? {};
      return { ...TUDO('NONE'), ...padrao } as Grants;
    }

    // Configurado: manda a configuração, e o que não estiver lá é NONE. Não se
    // volta a misturar o padrão do papel — uma pessoa com três áreas
    // configuradas não deve herdar em silêncio as outras treze.
    const out = TUDO('NONE');
    for (const l of linhas) out[l.area as Area] = l.access as Access;
    return out;
  }

  /** Atalho para as guardas. */
  async can(actor: Actor, area: Area, nivel: Access = 'VIEW'): Promise<boolean> {
    if (actor.role === UserRole.ADMIN) return true;
    const grants = await this.grantsFor(actor.id, actor.role);
    return atLeast(grants[area] ?? 'NONE', nivel);
  }

  // ══ Gestão ═══════════════════════════════════════════════════════════════

  /** As permissões de alguém, para a tela da Equipa. */
  async get(actor: Actor, userId: string) {
    if (actor.role !== UserRole.ADMIN) {
      throw new AppError('Apenas a administração gere permissões.', 403, 'FORBIDDEN');
    }

    const alvo = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!alvo) throw new AppError('Utilizador não encontrado.', 404, 'USER_NOT_FOUND');

    const linhas = await prisma.staffPermission.findMany({ where: { userId } });

    return {
      user: alvo,
      /** Falso = nunca foi configurado e vale o padrão do papel. */
      configured: linhas.length > 0,
      grants: await this.grantsFor(userId, alvo.role as UserRole),
    };
  }

  /**
   * Grava as permissões de alguém.
   *
   * Grava as DEZASSEIS de uma vez, mesmo as que ficam em NONE. Gravar só as
   * que mudaram deixaria a pessoa a meio caminho entre "configurada" e "a
   * herdar o papel", e aí ninguém consegue dizer de onde vem um acesso.
   *
   * Recusa mexer num ADMIN: ele tem tudo por definição, e deixar guardar
   * linhas para ele criava a ilusão de que estão a ser respeitadas.
   */
  async set(actor: Actor, userId: string, grants: Partial<Grants>) {
    if (actor.role !== UserRole.ADMIN) {
      throw new AppError('Apenas a administração gere permissões.', 403, 'FORBIDDEN');
    }

    const alvo = await prisma.user.findUnique({ where: { id: userId } });
    if (!alvo) throw new AppError('Utilizador não encontrado.', 404, 'USER_NOT_FOUND');

    if (alvo.role === UserRole.ADMIN) {
      throw new AppError(
        'Um administrador tem acesso a tudo por definição. Baixe-o a gestor ou a suporte '
        + 'antes de lhe definir permissões.',
        409, 'ADMIN_HAS_EVERYTHING',
      );
    }
    if (!ehEquipa(alvo.role as UserRole)) {
      throw new AppError(
        'Esta conta não é da equipa. Só motoristas, gestores e suporte entram no painel.',
        409, 'NOT_STAFF',
      );
    }

    const completo = { ...TUDO('NONE'), ...grants } as Grants;

    await prisma.$transaction(
      AREAS.map((area) =>
        prisma.staffPermission.upsert({
          where: { userId_area: { userId, area: area as never } },
          create: {
            userId, area: area as never, access: completo[area] as never, updatedBy: actor.id,
          },
          update: { access: completo[area] as never, updatedBy: actor.id },
        }),
      ),
    );

    await prisma.notification.create({
      data: {
        userId,
        title: 'Acessos atualizados',
        message: 'A administração alterou o que pode ver e fazer no painel. '
          + 'Se algum menu desapareceu, é por isso.',
      },
    }).catch(() => { /* um aviso que falha não desfaz a alteração */ });

    return this.get(actor, userId);
  }

  /** Volta ao padrão do papel: apaga as linhas e deixa de haver configuração. */
  async reset(actor: Actor, userId: string) {
    if (actor.role !== UserRole.ADMIN) {
      throw new AppError('Apenas a administração gere permissões.', 403, 'FORBIDDEN');
    }
    await prisma.staffPermission.deleteMany({ where: { userId } });
    return this.get(actor, userId);
  }

  /** A equipa toda com o resumo dos acessos, para a lista. */
  async listStaff(actor: Actor) {
    if (actor.role !== UserRole.ADMIN) {
      throw new AppError('Apenas a administração gere permissões.', 403, 'FORBIDDEN');
    }

    const pessoas = await prisma.user.findMany({
      where: { role: { in: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPPORT] as never[] } },
      select: { id: true, name: true, email: true, role: true, status: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });

    const linhas = await prisma.staffPermission.findMany({
      where: { userId: { in: pessoas.map((p) => p.id) } },
    });
    const porPessoa = new Map<string, number>();
    for (const l of linhas) porPessoa.set(l.userId, (porPessoa.get(l.userId) ?? 0) + 1);

    return Promise.all(pessoas.map(async (p) => {
      const grants = await this.grantsFor(p.id, p.role as UserRole);
      const comAcesso = AREAS.filter((a) => grants[a] !== 'NONE');
      return {
        ...p,
        configured: (porPessoa.get(p.id) ?? 0) > 0,
        areasCount: comAcesso.length,
        manageCount: AREAS.filter((a) => grants[a] === 'MANAGE').length,
      };
    }));
  }
}

export const permissionsService = new PermissionsService();
