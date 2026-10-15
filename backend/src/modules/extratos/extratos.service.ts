// src/modules/extratos/extratos.service.ts
//
// Importar um extrato bancário: ver primeiro, gravar depois.
//
// ─── DOIS PASSOS, E NÃO UM ──────────────────────────────────────────────────
//
// `prever` abre o PDF, lê os movimentos, confere-os contra a coluna do saldo e
// devolve tudo — SEM GRAVAR NADA. `importar` recebe de volta as escolhas dele
// e só então escreve.
//
// É o que ele pediu desde o princípio: «mostrar primeiro, gravar depois de eu
// ver». E é o que torna seguro um importador que lê PDFs: o pior que uma
// leitura errada consegue fazer é aparecer no ecrã.
//
// ─── O QUE CONTA E O QUE NÃO CONTA ──────────────────────────────────────────
//
// EMPRESA — só as saídas viram despesa. As entradas ficam guardadas como
// movimento e nunca entram na receita, porque a receita já vem dos fechos
// semanais. O extrato de Agosto tem mais de dez mil euros de entradas que são
// dinheiro da Uber e da Bolt já contado; importá-las dava um lucro inventado.
//
// PESSOAL — nada desconta do saldo por omissão. O saldo de motorista dele é o
// que a empresa lhe deve, não a conta bancária dele: um almoço pago com o
// cartão pessoal não tem nada a ver com esse saldo. Ele marca linha a linha as
// que quer descontar, e só essas criam uma despesa pessoal.
//
// TRANSFERÊNCIAS — nunca contam, em lado nenhum. Ver `classificar.ts`.
//
// ─── PORQUE É QUE AS DESPESAS VÃO PARA AS TABELAS DE SEMPRE ─────────────────
//
// Porque o lucro e o saldo já as lêem de lá, e esse código já está testado.
// Guardar os movimentos como uma segunda fonte dos mesmos números acabaria por
// divergir da primeira — e aí há dois ecrãs a dizer coisas diferentes sobre o
// mesmo dinheiro.

import { createHash } from 'node:crypto';
import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/errors/AppError';
import { UserRole } from '../../shared/types/enums';
import { extrairTextoPdf } from '../fleet-import/pdf/extrair-texto';
import { MOTIVO_NO_EXTRATO } from '../personal/motivos';
import { lerExtrato } from './index';
import { classificar, type Classe, type Identidades } from './classificar';
import type { Banco } from './tipos';

export type Actor = { id: string; role?: UserRole };
export type Ambito = 'PESSOAL' | 'EMPRESA';

/** Um dia "AAAA-MM-DD" ancorado ao meio-dia UTC, que fica no mesmo dia em
 *  qualquer fuso. A mesma regra do resto do projeto. */
function dia(iso: string | null | undefined): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return new Date(`${iso}T12:00:00.000Z`);
}

const cent = (n: number) => Math.round(n * 100) / 100;

export interface MovimentoPrevisto {
  /** A posição no extrato. É por aqui que a confirmação os volta a encontrar. */
  pos: number;
  data: string;
  dataLancamento: string | null;
  descricao: string;
  valor: number;
  saldo: number | null;
  referencia: string | null;
  classe: Classe;
  motivo: string;
  confianca: string;
  /** Vai criar uma despesa? Sugestão; ele decide. */
  conta: boolean;
}

export interface Escolha {
  pos: number;
  classe: Classe;
  conta: boolean;
  categoriaId?: string | null;
}

class ExtratosService {
  // ───────────────────────────────────────────────────────────── permissões ──

  /**
   * As contas da EMPRESA são da gestão; as PESSOAIS são de quem as tem.
   *
   * O âmbito pessoal não exige papel nenhum — exige a marca `personalFinance`
   * na conta, que é a mesma porta das outras finanças pessoais e já é
   * verificada pelo middleware. Aqui só se separa o que é da empresa.
   */
  private exigirEmpresa(actor: Actor) {
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.MANAGER) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
  }

  private guardar(actor: Actor, ambito: Ambito) {
    if (ambito === 'EMPRESA') this.exigirEmpresa(actor);
  }

  // ─────────────────────────────────────────────────────────────── contas ──

  async contas(actor: Actor, ambito: Ambito) {
    this.guardar(actor, ambito);
    return prisma.statementAccount.findMany({
      where: {
        scope: ambito,
        ...(ambito === 'PESSOAL' ? { ownerId: actor.id } : {}),
      },
      orderBy: [{ label: 'asc' }],
    });
  }

  /**
   * Os nomes com que o classificador reconhece uma transferência entre contas
   * dele.
   *
   * Vêm da base de dados — o nome dele, o nome da empresa, e as terminações
   * das contas que ele já registou. Nunca escritos no código: ver a nota em
   * `classificar.ts`.
   */
  private async identidades(actor: Actor): Promise<Identidades> {
    const [eu, frota, contas] = await Promise.all([
      prisma.user.findFirst({ where: { id: actor.id }, select: { name: true } }),
      prisma.fleet.findFirst({ select: { name: true } }),
      prisma.statementAccount.findMany({ select: { tail: true } }),
    ]);

    const empresa = await prisma.company.findFirst({ select: { name: true } })
      .catch(() => null);

    return {
      nomes: [eu?.name, frota?.name, empresa?.name].filter(Boolean) as string[],
      contas: contas.map((c) => c.tail),
    };
  }

  // ──────────────────────────────────────────────────────────────── prever ──

  /**
   * Lê o ficheiro e devolve o que lá está. NÃO grava.
   *
   * Recusa em três casos, e todos com uma frase que diz o que fazer: o PDF não
   * dá texto (é uma imagem), o banco não é reconhecido, ou os valores não
   * fecham com a coluna do saldo.
   */
  async prever(actor: Actor, ambito: Ambito, ficheiro: Buffer, nome: string) {
    this.guardar(actor, ambito);

    const hash = createHash('sha256').update(ficheiro).digest('hex');

    // Já foi importado? Diz-se ANTES de o ler todo: é a resposta mais útil e
    // evita a segunda importação, que é o engano mais difícil de ver depois.
    const repetido = await prisma.statementFile.findFirst({
      where: { fileHash: hash },
      select: { id: true, createdAt: true, account: { select: { label: true } } },
    });
    if (repetido) {
      throw new AppError(
        `Este ficheiro já foi importado em ${repetido.createdAt.toLocaleDateString('pt-PT')}`
        + ` para a conta «${repetido.account.label}».`,
        409, 'STATEMENT_ALREADY_IMPORTED',
      );
    }

    const texto = extrairTextoPdf(ficheiro);
    const lido = lerExtrato(texto);
    if (!lido.ok) throw new AppError(lido.motivo, 422, 'STATEMENT_UNREADABLE');

    const { leitura } = lido;
    if (!leitura.confere) {
      throw new AppError(
        leitura.avisos.join(' ') || 'Os valores deste extrato não fecham com o saldo do banco.',
        422, 'STATEMENT_DOES_NOT_BALANCE',
      );
    }

    const identidades = await this.identidades(actor);

    const movimentos: MovimentoPrevisto[] = leitura.movimentos.map((m, i) => {
      const c = classificar({ descricao: m.descricao, valor: m.valor }, identidades);
      return {
        pos: i,
        data: m.data,
        dataLancamento: m.dataLancamento,
        descricao: m.descricao,
        valor: m.valor,
        saldo: m.saldo,
        referencia: m.referencia,
        classe: c.classe,
        motivo: c.motivo,
        confianca: c.confianca,
        // A sugestão: uma despesa conta; uma entrada ou uma transferência não.
        // No pessoal nada conta por omissão — é ele que marca.
        conta: ambito === 'EMPRESA' && c.classe === 'DESPESA',
      };
    });

    // A conta já existe? Reconhece-se pelo banco e pela terminação do IBAN.
    const conta = leitura.contaTerminadaEm
      ? await prisma.statementAccount.findFirst({
        where: { bank: leitura.banco as Banco, tail: leitura.contaTerminadaEm },
      })
      : null;

    return {
      banco: leitura.banco,
      ficheiro: { nome, hash },
      conta: conta
        ? { id: conta.id, label: conta.label, tail: conta.tail, nova: false }
        : { id: null, label: null, tail: leitura.contaTerminadaEm, nova: true },
      periodo: leitura.periodo,
      saldoInicial: leitura.saldoInicial,
      saldoFinal: leitura.saldoFinal,
      avisos: leitura.avisos,
      movimentos,
      totais: {
        despesas: cent(movimentos.filter((m) => m.classe === 'DESPESA')
          .reduce((s, m) => s + m.valor, 0)),
        receitas: cent(movimentos.filter((m) => m.classe === 'RECEITA')
          .reduce((s, m) => s + m.valor, 0)),
        transferencias: cent(movimentos.filter((m) => m.classe === 'TRANSFERENCIA')
          .reduce((s, m) => s + m.valor, 0)),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────── importar ──

  /**
   * Grava o que ele confirmou.
   *
   * Tudo dentro de UMA transação: ou entra o extrato inteiro com as despesas
   * que ele marcou, ou não entra nada. Um extrato meio gravado é pior do que
   * nenhum, porque parece completo.
   */
  async importar(actor: Actor, entrada: {
    ambito: Ambito;
    contaId?: string | null;
    novaConta?: { banco: string; tail: string; label: string } | null;
    ficheiro: { nome: string; hash: string };
    periodo: { de: string | null; ate: string | null };
    saldoInicial: number | null;
    saldoFinal: number | null;
    movimentos: (MovimentoPrevisto & { escolha?: Escolha })[];
  }) {
    this.guardar(actor, entrada.ambito);

    if (entrada.movimentos.length === 0) {
      throw new AppError('Não há movimentos para importar.', 400, 'NO_MOVEMENTS');
    }

    const repetido = await prisma.statementFile.findFirst({
      where: { fileHash: entrada.ficheiro.hash }, select: { id: true },
    });
    if (repetido) {
      throw new AppError('Este ficheiro já foi importado.', 409, 'STATEMENT_ALREADY_IMPORTED');
    }

    return prisma.$transaction(async (tx) => {
      // ── A conta ──────────────────────────────────────────────────────────
      let contaId = entrada.contaId ?? null;

      if (!contaId) {
        if (!entrada.novaConta) {
          throw new AppError('Diga de que conta é este extrato.', 400, 'ACCOUNT_REQUIRED');
        }
        const nova = await tx.statementAccount.create({
          data: {
            bank: entrada.novaConta.banco as never,
            scope: entrada.ambito as never,
            tail: entrada.novaConta.tail.slice(-4) || '0000',
            label: entrada.novaConta.label.trim().slice(0, 60) || 'Conta',
            ownerId: entrada.ambito === 'PESSOAL' ? actor.id : null,
          },
        });
        contaId = nova.id;
      } else {
        const existe = await tx.statementAccount.findFirst({
          where: { id: contaId, scope: entrada.ambito as never },
          select: { id: true },
        });
        if (!existe) throw new AppError('Conta não encontrada.', 404, 'ACCOUNT_NOT_FOUND');
      }

      // ── O ficheiro ───────────────────────────────────────────────────────
      const extrato = await tx.statementFile.create({
        data: {
          accountId: contaId,
          periodStart: dia(entrada.periodo.de),
          periodEnd: dia(entrada.periodo.ate),
          openingBalance: entrada.saldoInicial ?? null,
          closingBalance: entrada.saldoFinal ?? null,
          fileName: entrada.ficheiro.nome.slice(0, 200),
          fileHash: entrada.ficheiro.hash,
          importedById: actor.id,
        },
      });

      // ── Os movimentos, e as despesas dos que contam ──────────────────────
      let despesasCriadas = 0;

      for (const m of entrada.movimentos) {
        const escolha = m.escolha ?? { pos: m.pos, classe: m.classe, conta: m.conta };
        const quando = dia(m.data);
        if (!quando) continue;

        let companyExpenseId: string | null = null;
        let personalExpenseId: string | null = null;

        // Só uma SAÍDA pode virar despesa. Uma entrada marcada por engano não
        // deve criar uma despesa negativa — e uma transferência nunca conta.
        const podeContar = escolha.conta
          && escolha.classe === 'DESPESA'
          && m.valor < 0;

        if (podeContar && entrada.ambito === 'EMPRESA') {
          const d = await tx.companyExpense.create({
            data: {
              categoryId: escolha.categoriaId ?? null,
              amount: Math.abs(cent(m.valor)),
              spentOn: quando,
              supplier: m.descricao.slice(0, 120),
              notes: `Importado do extrato ${entrada.ficheiro.nome}`.slice(0, 500),
              createdById: actor.id,
            },
          });
          companyExpenseId = d.id;
          despesasCriadas++;
        }

        if (podeContar && entrada.ambito === 'PESSOAL') {
          // A despesa pessoal desconta do saldo pela porta dos ajustes, que é
          // a mesma que o lançamento à mão usa. Ver `personal.service.ts`.
          const ajuste = await tx.balanceAdjustment.create({
            data: {
              userId: actor.id,
              type: 'DEBIT' as never,
              amount: Math.abs(cent(m.valor)),
              // O mesmo motivo que o lançamento à mão escreve. Ver `motivos.ts`:
              // duas cópias deste texto davam duas etiquetas no mesmo extrato.
              reason: MOTIVO_NO_EXTRATO,
              createdBy: actor.id,
              // A data é a do movimento no banco, NÃO a de hoje. O ajuste é o
              // que ancora a linha no extrato e decide os saldos corridos: um
              // gasto de há três semanas importado hoje tem de pesar nessa
              // semana, senão os saldos de todos os dias no meio ficam errados.
              createdAt: quando,
            },
          });
          const d = await tx.personalExpense.create({
            data: {
              userId: actor.id,
              categoryId: escolha.categoriaId ?? null,
              amount: Math.abs(cent(m.valor)),
              spentOn: quando,
              notes: m.descricao.slice(0, 500),
              adjustmentId: ajuste.id,
            },
          });
          personalExpenseId = d.id;
          despesasCriadas++;
        }

        await tx.statementMovement.create({
          data: {
            statementId: extrato.id,
            accountId: contaId,
            occurredOn: quando,
            bookedOn: dia(m.dataLancamento),
            description: m.descricao.slice(0, 500),
            amount: cent(m.valor),
            balance: m.saldo ?? null,
            reference: m.referencia?.slice(0, 80) ?? null,
            class: escolha.classe as never,
            position: m.pos,
            companyExpenseId,
            personalExpenseId,
          },
        });
      }

      return {
        extratoId: extrato.id,
        movimentos: entrada.movimentos.length,
        despesasCriadas,
      };
    });
  }

  // ──────────────────────────────────────────────────────────────── listar ──

  async listar(actor: Actor, ambito: Ambito) {
    this.guardar(actor, ambito);

    const extratos = await prisma.statementFile.findMany({
      where: {
        account: {
          scope: ambito as never,
          ...(ambito === 'PESSOAL' ? { ownerId: actor.id } : {}),
        },
      },
      orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
      take: 60,
      include: {
        account: { select: { id: true, label: true, bank: true, tail: true } },
        _count: { select: { movements: true } },
      },
    });

    return extratos.map((e) => ({
      id: e.id,
      conta: e.account,
      nome: e.fileName,
      de: e.periodStart,
      ate: e.periodEnd,
      saldoInicial: e.openingBalance === null ? null : Number(e.openingBalance),
      saldoFinal: e.closingBalance === null ? null : Number(e.closingBalance),
      movimentos: e._count.movements,
      importadoEm: e.createdAt,
    }));
  }

  async movimentos(actor: Actor, ambito: Ambito, extratoId: string) {
    this.guardar(actor, ambito);

    const extrato = await prisma.statementFile.findFirst({
      where: {
        id: extratoId,
        account: {
          scope: ambito as never,
          ...(ambito === 'PESSOAL' ? { ownerId: actor.id } : {}),
        },
      },
      select: { id: true },
    });
    if (!extrato) throw new AppError('Extrato não encontrado.', 404, 'STATEMENT_NOT_FOUND');

    const linhas = await prisma.statementMovement.findMany({
      where: { statementId: extratoId },
      orderBy: { position: 'asc' },
    });

    return linhas.map((m) => ({
      id: m.id,
      data: m.occurredOn,
      descricao: m.description,
      valor: Number(m.amount),
      saldo: m.balance === null ? null : Number(m.balance),
      classe: m.class,
      conta: m.companyExpenseId !== null || m.personalExpenseId !== null,
    }));
  }

  /**
   * Apagar uma importação apaga também as despesas que ela criou.
   *
   * Senão ficavam despesas órfãs a contar no lucro, vindas de um extrato que
   * já não existe — e não haveria por onde as encontrar.
   */
  async apagar(actor: Actor, ambito: Ambito, extratoId: string) {
    this.guardar(actor, ambito);

    const extrato = await prisma.statementFile.findFirst({
      where: {
        id: extratoId,
        account: {
          scope: ambito as never,
          ...(ambito === 'PESSOAL' ? { ownerId: actor.id } : {}),
        },
      },
      select: { id: true },
    });
    if (!extrato) throw new AppError('Extrato não encontrado.', 404, 'STATEMENT_NOT_FOUND');

    const linhas = await prisma.statementMovement.findMany({
      where: { statementId: extratoId },
      select: { companyExpenseId: true, personalExpenseId: true },
    });

    const daEmpresa = linhas.map((l) => l.companyExpenseId).filter(Boolean) as string[];
    const pessoais = linhas.map((l) => l.personalExpenseId).filter(Boolean) as string[];

    await prisma.$transaction(async (tx) => {
      // Os movimentos saem com o extrato (CASCADE). As despesas é que não,
      // por isso apagam-se à mão — e a despesa pessoal leva o ajuste atrás,
      // senão o saldo ficava descontado por uma despesa que já não existe.
      if (daEmpresa.length > 0) {
        await tx.companyExpense.deleteMany({ where: { id: { in: daEmpresa } } });
      }
      if (pessoais.length > 0) {
        const comAjuste = await tx.personalExpense.findMany({
          where: { id: { in: pessoais } },
          select: { adjustmentId: true },
        });
        await tx.personalExpense.deleteMany({ where: { id: { in: pessoais } } });
        const ajustes = comAjuste.map((p) => p.adjustmentId).filter(Boolean) as string[];
        if (ajustes.length > 0) {
          await tx.balanceAdjustment.deleteMany({ where: { id: { in: ajustes } } });
        }
      }
      await tx.statementFile.delete({ where: { id: extratoId } });
    });
  }
}

export const extratosService = new ExtratosService();
