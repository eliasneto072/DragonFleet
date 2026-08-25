// src/test/factories.ts
//
// Construtores de dados para os testes de integração.
//
// ─── POR QUE EXISTEM ─────────────────────────────────────────────────────────
//
// Um teste sobre "retirada sem IBAN é recusada" precisa de um motorista, de um
// fecho registado para haver saldo, e de nenhuma conta bancária. Escrever isso
// à mão em cada teste enche o ficheiro de ruído: quem o ler a seguir tem de
// distinguir sozinho o que é preparação do que é a regra a testar.
//
// Com construtores, cada teste declara SÓ o que lhe importa. `criaMotorista()`
// sem argumentos dá um motorista válido; `criaMotorista({ status: 'BLOCKED' })`
// diz, só por si, que o estado é o ponto do teste.
//
// ─── OS TESTES CONSTROEM OS SEUS PRÓPRIOS DADOS ──────────────────────────────
//
// Nada aqui depende do seed-demo. O seed é para exploração manual; se os testes
// se apoiassem nele, ganhavam dependências invisíveis entre si — aprovar o IBAN
// da Sofia num teste partiria o seguinte, que a esperava pendente — e passavam
// a depender da ordem de execução.

import { testDb } from './harness';
import { computeTotals } from '../modules/settlements/settlements.types';

/** Contador para emails únicos dentro da mesma execução. */
let seq = 0;
function unico(prefixo: string): string {
  seq += 1;
  return `${prefixo}-${seq}@teste.local`;
}

export async function criaMotorista(overrides: {
  name?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'BLOCKED' | 'AGUARDANDO_REGULARIZACAO';
} = {}) {
  return testDb.user.create({
    data: {
      name: overrides.name ?? 'Motorista de Teste',
      email: unico('motorista'),
      // Hash fixo e não bcrypt.hash(): estes testes nunca fazem login por
      // password — usam authHeader() — e o bcrypt é lento de propósito.
      // Gerá-lo em cada teste acrescentaria centenas de milissegundos por caso
      // para verificar nada.
      password: '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQR',
      role: 'DRIVER',
      status: overrides.status ?? 'ACTIVE',
    },
  });
}

export async function criaAdmin() {
  return testDb.user.create({
    data: {
      name: 'Administrador de Teste',
      email: unico('admin'),
      password: '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQR',
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });
}

/**
 * Conta bancária aprovada e pronta a receber.
 *
 * O IBAN passa no resto 97 — inventá-lo à mão faria a submissão ser recusada
 * pela validação e o teste falharia pela razão errada.
 */
export async function criaContaAprovada(userId: string, opts: {
  iban?: string;
  holderName?: string;
} = {}) {
  return testDb.bankAccount.create({
    data: {
      userId,
      iban: opts.iban ?? 'PT50003300004567890123437',
      holderName: opts.holderName ?? 'Motorista de Teste',
      reviewedAt: new Date(),
    },
  });
}

/** Conta submetida e à espera de decisão: existe, mas não serve para receber. */
export async function criaContaPendente(userId: string) {
  return testDb.bankAccount.create({
    data: {
      userId,
      pendingIban: 'PT50002700000001234567833',
      pendingHolderName: 'Motorista de Teste',
      pendingProofUrl: 'https://exemplo.local/comprovativo.pdf',
      pendingProofKey: 'teste/comprovativo',
      pendingAt: new Date(),
    },
  });
}

/**
 * Fecho semanal — a única origem de saldo no sistema.
 *
 * `REGISTERED` por omissão porque é o que credita; um `DRAFT` fica visível mas
 * não mexe no saldo, e há testes que dependem dessa diferença.
 *
 * Os totais saem do computeTotals real e não de números escritos à mão: um
 * teste que afirme "o saldo é 800" a partir de uma conta feita à parte deixa de
 * valer no dia em que a fórmula mudar, e falha sem que nada esteja errado.
 */
export async function criaFecho(opts: {
  userId: string;
  createdById: string;
  weekStart?: Date;
  status?: 'DRAFT' | 'REGISTERED' | 'CANCELLED';
  uberAmount?: number;
  boltAmount?: number;
  fuelAmount?: number;
  otherDeductions?: number;
  commissionRate?: number;
  taxRate?: number;
}) {
  const amounts = {
    uberAmount: opts.uberAmount ?? 1000,
    boltAmount: opts.boltAmount ?? 0,
    otherRevenue: 0,
    tollsAmount: 0,
    fuelAmount: opts.fuelAmount ?? 0,
    vehicleFee: 0,
    otherDeductions: opts.otherDeductions ?? 0,
  };
  const commissionRate = opts.commissionRate ?? 0;
  const taxRate = opts.taxRate ?? 0;

  const totals = computeTotals({ ...amounts, commissionRate, taxRate });

  // Semana fixa por omissão, para não depender do dia em que a suite corre.
  const weekStart = opts.weekStart ?? new Date('2026-01-05T00:00:00Z');
  const weekEnd = new Date(weekStart.getTime() + 6 * 86_400_000);
  const status = opts.status ?? 'REGISTERED';

  return testDb.weeklySettlement.create({
    data: {
      userId: opts.userId,
      createdById: opts.createdById,
      weekStart,
      weekEnd,
      ...amounts,
      commissionRate,
      taxRate,
      taxBase: totals.taxBase,
      taxAmount: totals.taxAmount,
      grossRevenue: totals.grossRevenue,
      totalDeductions: totals.totalDeductions,
      profitBase: totals.profitBase,
      commissionAmount: totals.commissionAmount,
      netToDriver: totals.netToDriver,
      status,
      registeredAt: status === 'REGISTERED' ? weekEnd : null,
    },
  });
}

/**
 * Lançamento comunicado pelo motorista.
 *
 * Não credita saldo, e é exatamente essa a regra que um dos testes verifica:
 * o que o motorista comunica é informação, não dinheiro.
 */
export async function criaLancamento(opts: {
  userId: string;
  amount?: number;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
}) {
  return testDb.earning.create({
    data: {
      userId: opts.userId,
      amount: opts.amount ?? 500,
      platform: 'UBER',
      status: opts.status ?? 'PENDING',
      date: new Date('2026-01-05T00:00:00Z'),
    },
  });
}

/** Retirada já criada em base, para testar transições sem passar pela criação. */
export async function criaRetirada(opts: {
  userId: string;
  amount?: number;
  status?: 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED';
  paidToIban?: string | null;
}) {
  return testDb.withdrawal.create({
    data: {
      userId: opts.userId,
      amount: opts.amount ?? 100,
      status: opts.status ?? 'PENDING',
      receiptUrl: 'https://exemplo.local/recibo.pdf',
      receiptKey: 'teste/recibo',
      paidToIban: opts.paidToIban ?? null,
    },
  });
}

/** Sociedade a quem se emite recibo verde. */
export async function criaSociedade(name = 'Sociedade de Teste') {
  return testDb.company.create({ data: { name } });
}
