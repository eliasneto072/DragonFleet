// src/modules/invites/invites.service.ts
//
// Os convites de uma frota: criar, listar, revogar — e usar.
//
// ─── O QUE AQUI É DELICADO ──────────────────────────────────────────────────
//
// Uma coisa só: usar um convite. É a única operação do sistema inteiro em que
// alguém sem sessão escreve numa frota, e por isso é a única em que a frota não
// vem de quem pede — vem do código. Se esse caminho estiver errado, um
// motorista aparece dentro da conta de uma empresa que não é a dele.
//
// Por isso `usar` faz três coisas numa ordem que não é negociável:
//
//   1. lê o convite pelo código, atravessando frotas de propósito (declarado
//      com `comoSistema`, tal como o login lê um utilizador pelo email);
//   2. reclama o lugar num ÚNICO update com as condições lá dentro — é isso
//      que impede duas pessoas de usarem o último lugar ao mesmo tempo;
//   3. corre o resto DENTRO da frota do convite, com `comFrota`.
//
// ─── PORQUE É QUE A TRAVA É UM UPDATE E NÃO UM IF ───────────────────────────
//
// Porque ler-e-depois-escrever não trava nada. Duas pessoas com o último lugar
// leem as duas `remaining = 1`, decidem as duas que podem, e entram as duas.
// Posta como condição do próprio update, o Postgres tranca a linha, reavalia a
// condição contra a versão nova, e a segunda afecta zero linhas. Está provado
// em `corrida.sh`: `UPDATE 1` e depois `UPDATE 0`.

import { prisma, type Transacao } from '../../config/prisma';
import { comFrota, comoSistema } from '../../config/escopo';
import { AppError } from '../../shared/errors/AppError';
import { UserRole } from '../../shared/types/enums';
import {
  gerarCodigo, normalizarCodigo, estadoDoConvite, validoAte,
  TEXTO_DO_ESTADO, type EstadoDoConvite,
} from './convite';

/** Hoje ao dia, em UTC. As validades contam-se em dias inteiros. */
function hojeAoDia(): Date {
  const a = new Date();
  return new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()));
}

export interface EntradaDoConvite {
  label?: string | null;
  /** Dias de validade. `null` = sem validade. */
  dias?: number | null;
  /** Quantas pessoas pode inscrever. `null` = sem limite. */
  maxUses?: number | null;
}

export interface ConviteNaLista {
  id: string;
  codigo: string;
  label: string | null;
  estado: EstadoDoConvite;
  /** Último dia em que vale. `null` = sem validade. */
  validoAte: string | null;
  maxUses: number | null;
  restantes: number | null;
  usos: number;
  criadoEm: Date;
  criadoPor: string | null;
}

/**
 * Uma linha da base de dados para o que o ecrã mostra.
 *
 * Escrito uma vez e usado pelo `listar` e pelo `criar`: duplicado, um convite
 * acabado de criar aparecia com uma forma e o mesmo convite depois de recarregar
 * a página aparecia com outra.
 */
function paraLista(c: {
  id: string; code: string; label: string | null;
  expiresOn: Date | null; maxUses: number | null; remaining: number | null;
  uses: number; revokedAt: Date | null; createdAt: Date; createdBy: string | null;
}): ConviteNaLista {
  return {
    id: c.id,
    codigo: c.code,
    label: c.label,
    estado: estadoDoConvite(c),
    validoAte: c.expiresOn ? c.expiresOn.toISOString().slice(0, 10) : null,
    maxUses: c.maxUses,
    restantes: c.remaining,
    usos: c.uses,
    criadoEm: c.createdAt,
    criadoPor: c.createdBy,
  };
}

/** Quem pode mexer em convites. A rota já o exige; isto é o cinto. */
function ehEquipa(role?: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.MANAGER || role === UserRole.SUPPORT;
}

export class InvitesService {
  /** Os convites desta frota. O âmbito põe o filtro — ver `escopo.ts`. */
  async listar(): Promise<ConviteNaLista[]> {
    const linhas = await prisma.invite.findMany({ orderBy: { createdAt: 'desc' } });
    return linhas.map(paraLista);
  }

  /**
   * Um código livre.
   *
   * ─── PORQUE É QUE TENTA MAIS DO QUE UMA VEZ ─────────────────────────────────
   *
   * Vinte e quatro letras em dez posições são 6,3 × 10¹³ códigos: uma colisão
   * é um acontecimento que não vai acontecer. Mas se acontecesse, o `code` é
   * único e o insert rebentava com um erro de base de dados em cima de quem
   * estava a criar um convite — por nada. Cinco tentativas resolvem-no em
   * silêncio, e a sexta diz que algo está mal em vez de tentar para sempre.
   */
  private async codigoLivre(): Promise<string> {
    for (let i = 0; i < 5; i += 1) {
      const codigo = gerarCodigo();
      // Atravessa frotas de propósito: o código é único no sistema inteiro, e
      // confirmar isso só dentro da frota de quem pede não confirmava nada.
      const existe = await comoSistema(async () => await prisma.invite.findUnique({
        where: { code: codigo }, select: { id: true },
      }));
      if (!existe) return codigo;
    }
    throw new AppError(
      'Não foi possível gerar um código. Tente outra vez.',
      500, 'CODIGO_INDISPONIVEL',
    );
  }

  async criar(
    actor: { id: string; role?: UserRole },
    entrada: EntradaDoConvite,
  ): Promise<ConviteNaLista> {
    if (!ehEquipa(actor.role)) {
      throw new AppError('Acesso restrito.', 403, 'FORBIDDEN');
    }

    const dias = entrada.dias ?? null;
    const maxUses = entrada.maxUses ?? null;

    if (maxUses !== null && maxUses < 1) {
      throw new AppError(
        'O limite tem de ser pelo menos uma pessoa. Deixe em branco para não ter limite.',
        400, 'LIMITE_INVALIDO',
      );
    }

    const codigo = await this.codigoLivre();

    const c = await prisma.invite.create({
      data: {
        code: codigo,
        label: entrada.label?.trim() || null,
        expiresOn: validoAte(dias),
        maxUses,
        // Nasce igual ao limite: é esta que a trava gasta. Ver a nota no
        // `schema.prisma` sobre as três colunas.
        remaining: maxUses,
        createdBy: actor.id,
      },
    });

    return paraLista(c);
  }

  /**
   * Desliga um convite. Não o apaga.
   *
   * Apagá-lo deixava sem resposta a pergunta que se faz depois: "por onde é que
   * esta pessoa entrou?". Revogado, o histórico fica e o link deixa de abrir.
   */
  async revogar(actor: { id: string; role?: UserRole }, id: string) {
    if (!ehEquipa(actor.role)) {
      throw new AppError('Acesso restrito.', 403, 'FORBIDDEN');
    }

    // `updateMany` e não `update`: o filtro da frota entra no `where` (ver
    // `escopo.ts`), e com `update` o Prisma recusava um `where` que não é só a
    // chave. Zero linhas quer dizer "não é desta frota" — que, para quem
    // pergunta, é o mesmo que não existir.
    const { count } = await prisma.invite.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (count === 0) {
      throw new AppError('Convite não encontrado.', 404, 'CONVITE_NAO_ENCONTRADO');
    }

    return { ok: true };
  }

  /**
   * O que se mostra a quem abriu o link, antes de se inscrever.
   *
   * ─── O QUE ISTO DIZ, E O QUE NÃO DIZ ────────────────────────────────────────
   *
   * Diz o nome da frota — tem de dizer: quem se inscreve precisa de ver em que
   * empresa está a entrar antes de escrever a palavra-passe. Não diz mais nada:
   * nem quantos lugares faltam, nem quem criou o convite, nem nada da frota
   * além do nome. É uma rota pública, e um código inventado por alguém não deve
   * ser uma janela para dentro.
   */
  async resolver(codigoBruto: string): Promise<{
    estado: EstadoDoConvite; frota: { nome: string } | null; mensagem: string | null;
  }> {
    const code = normalizarCodigo(codigoBruto);
    if (!code) {
      return {
        estado: 'revogado',
        frota: null,
        mensagem: 'Este link não é um convite válido. Confirme o endereço.',
      };
    }

    // Atravessa frotas, e tem de ser: é precisamente esta leitura que descobre
    // a frota, e quem pergunta não tem sessão nenhuma. Procura UMA linha por um
    // código que quem pergunta já escreveu — não é uma lista, e não aceita
    // filtros.
    const c = await comoSistema(async () => await prisma.invite.findUnique({
      where: { code },
      select: {
        expiresOn: true, remaining: true, revokedAt: true,
        fleet: { select: { name: true, active: true } },
      },
    }));

    if (!c) {
      return {
        estado: 'revogado',
        frota: null,
        mensagem: 'Este convite não existe. Peça um novo à frota.',
      };
    }

    // Uma frota desligada não recebe gente nova. O mesmo que o middleware do
    // âmbito faz a quem já lá está, e dito sem revelar que a frota existe.
    if (!c.fleet?.active) {
      return {
        estado: 'revogado',
        frota: null,
        mensagem: 'Este convite não está disponível. Peça um novo à frota.',
      };
    }

    const estado = estadoDoConvite(c);

    return estado === 'valido'
      ? { estado, frota: { nome: c.fleet.name }, mensagem: null }
      : { estado, frota: null, mensagem: TEXTO_DO_ESTADO[estado] };
  }

  /**
   * Reclama um lugar e corre `fn` dentro da frota do convite.
   *
   * O `tx` chega a `fn` de propósito: o que `fn` escrever tem de estar na MESMA
   * transação que gastou o lugar. Se a criação da conta falhar, o lugar volta
   * atrás sozinho — e um lugar gasto sem conta criada é um lugar que ninguém
   * recupera, porque não há nada que o lembre.
   */
  async usar<T>(
    codigoBruto: string,
    fn: (fleetId: string, tx: Transacao) => Promise<T>,
  ): Promise<T> {
    const code = normalizarCodigo(codigoBruto);
    if (!code) {
      throw new AppError(
        'Este link não é um convite válido. Confirme o endereço.',
        400, 'CONVITE_INVALIDO',
      );
    }

    return comoSistema(async () => await prisma.$transaction(async (tx) => {
      const c = await tx.invite.findUnique({
        where: { code },
        include: { fleet: { select: { active: true } } },
      });
      if (!c) {
        throw new AppError(
          'Este convite não existe. Peça um novo à frota.',
          404, 'CONVITE_NAO_ENCONTRADO',
        );
      }

      if (!c.fleet?.active) {
        throw new AppError(
          'Este convite não está disponível. Peça um novo à frota.',
          403, 'CONVITE_INDISPONIVEL',
        );
      }

      // Esta leitura é só para a mensagem: dizer "expirado" em vez de "não deu".
      // A decisão a sério é o update abaixo.
      const estado = estadoDoConvite(c);
      if (estado !== 'valido') {
        throw new AppError(TEXTO_DO_ESTADO[estado], 403, `CONVITE_${estado.toUpperCase()}`);
      }

      // ─── A TRAVA ────────────────────────────────────────────────────────
      //
      // Um update, com as três condições lá dentro. É o Postgres que decide
      // quem fica com o último lugar, e não este código — ver a nota no topo.
      const { count } = await tx.invite.updateMany({
        where: {
          code,
          revokedAt: null,
          AND: [
            { OR: [{ expiresOn: null }, { expiresOn: { gte: hojeAoDia() } }] },
            { OR: [{ remaining: null }, { remaining: { gt: 0 } }] },
          ],
        },
        data: { remaining: { decrement: 1 }, uses: { increment: 1 } },
      });

      if (count === 0) {
        // Chegou aqui com o convite válido e saiu sem lugar: alguém ficou com
        // o último entre a leitura e o update. É a resposta certa, e é raro o
        // suficiente para valer a pena dizê-lo por palavras diferentes.
        throw new AppError(
          'Este convite acabou de ficar sem lugares. Peça um novo à frota.',
          409, 'CONVITE_ESGOTADO',
        );
      }

      return await comFrota(c.fleetId, () => fn(c.fleetId, tx));
    }));
  }
}

export const invitesService = new InvitesService();
