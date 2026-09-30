// src/modules/fleet-import/parsers/prio-frota.ts
//
// Os abastecimentos de combustível, do portal MyPrio (Transações Frota).
//
// ─── UMA TRANSAÇÃO SÃO QUATRO LINHAS ────────────────────────────────────────
//
// O PDF da Prio não tem uma linha por abastecimento. Tem quatro:
//
//   PA A16 Sintra Cascais O 28/09/2026 7824731729670014 Val. Liq: 81,23
//   Geral Ativo 45,85 L ECO DIESEL 082523 1 01 A aguardar fatura 99,9100 Val. Ref (c/iva): 2,289
//   Portugal 19:16:58 BG-49-GP IVA: 18,68
//   Val. Des (c/iva): 0,110
//
// O valor que interessa (99,9100) está na segunda. A matrícula está na
// terceira. Por isso o leitor anda em blocos e não linha a linha.
//
// O bloco é detetado pelo `Val. Liq:` — que abre sempre a primeira linha — e
// não por contar de quatro em quatro. Contar parecia mais simples e partia-se
// na primeira transação que trouxesse uma linha a mais ou a menos, sem dizer
// nada: a partir daí todas as seguintes saíam trocadas.
//
// ─── O VALOR É COM IVA, E ISSO É UMA DECISÃO ────────────────────────────────
//
// `Total(c/iva)` é a coluna 99,9100 — o que saiu mesmo da conta da empresa. É
// o que o motorista paga, decidido pelo cliente.
//
// ATENÇÃO à armadilha: no ficheiro dos ELÉTRICOS há uma coluna chamada `Total`
// que NÃO tem IVA. Mesmo nome, sentido oposto. Ver `prio-electric.ts`.
//
// ─── A VERIFICAÇÃO, QUANDO NÃO HÁ TOTAL ─────────────────────────────────────
//
// O PDF da Prio não traz total nenhum — o ecrã mostra-o, o ficheiro não. Sem
// ele não dá para comparar a soma com nada.
//
// Mas cada linha traz o suficiente para se verificar a si própria:
//
//   Val. Liq 81,23  +  IVA 18,68  =  Total 99,91
//
// Se o leitor apanhar a coluna errada, a conta da linha deixa de fechar. Num
// extrato real as doze linhas fecham todas. É a mesma garantia do total da Via
// Verde, por outro caminho.

import { cent, numeroPt, somaCent, MATRICULA } from './numeros';
import type { Leitura } from './tipos';

const ABRE_BLOCO = /Val\. Liq:\s*([\d.,]+)/;
const IVA = /IVA:\s*([\d.,]+)/;
/** O total com IVA vem sempre imediatamente antes de "Val. Ref". */
const TOTAL_CIVA = /([\d.,]+)\s+Val\. Ref/;

interface Transacao {
  matricula: string | null;
  total: number;
  liquido: number | null;
  iva: number | null;
}

export function lerPrioFrota(texto: string): Leitura {
  const avisos: string[] = [];
  const linhas = (texto ?? '').split('\n');

  const transacoes: Transacao[] = [];
  let bloco: string[] = [];

  const fechar = () => {
    if (!bloco.length) return;
    const juntas = bloco.join('\n');
    const mTotal = TOTAL_CIVA.exec(juntas);
    if (!mTotal) { bloco = []; return; }

    const total = numeroPt(mTotal[1]);
    if (total === null) { bloco = []; return; }

    const mMat = MATRICULA.exec(juntas);
    const mLiq = ABRE_BLOCO.exec(juntas);
    const mIva = IVA.exec(juntas);

    transacoes.push({
      matricula: mMat ? mMat[1] : null,
      total,
      liquido: mLiq ? numeroPt(mLiq[1]) : null,
      iva: mIva ? numeroPt(mIva[1]) : null,
    });
    bloco = [];
  };

  for (const linha of linhas) {
    // Uma linha com "Val. Liq:" começa uma transação nova — e fecha a anterior.
    if (ABRE_BLOCO.test(linha)) fechar();
    if (bloco.length || ABRE_BLOCO.test(linha)) bloco.push(linha);
  }
  fechar();

  // ── A conferência: em cada linha, líquido + IVA = total ──────────────────
  let desalinhadas = 0;
  for (const t of transacoes) {
    if (t.liquido === null || t.iva === null) continue;
    if (Math.abs(cent(t.liquido + t.iva) - cent(t.total)) > 0.011) desalinhadas += 1;
  }

  const porMatriculaMap = new Map<string, number[]>();
  const semValores: number[] = [];
  for (const t of transacoes) {
    if (t.matricula) {
      const lista = porMatriculaMap.get(t.matricula) ?? [];
      lista.push(t.total);
      porMatriculaMap.set(t.matricula, lista);
    } else {
      semValores.push(t.total);
    }
  }

  const porMatricula = [...porMatriculaMap.entries()]
    .map(([matricula, valores]) => ({ matricula, total: somaCent(valores) }))
    .sort((a, b) => a.matricula.localeCompare(b.matricula));

  const semMatricula = { total: somaCent(semValores), ocorrencias: semValores.length };
  const totalLido = cent(somaCent(porMatricula.map((p) => p.total)) + semMatricula.total);

  let confere = true;
  if (transacoes.length === 0) {
    confere = false;
    avisos.push('Não encontrei nenhum abastecimento no PDF. Confirme que exportou "Transações Frota".');
  }
  if (desalinhadas > 0) {
    confere = false;
    avisos.push(
      `${desalinhadas} de ${transacoes.length} linhas não fecham a conta `
      + `(valor líquido + IVA ≠ total). O ficheiro da Prio pode ter mudado de formato.`,
    );
  }
  if (semMatricula.ocorrencias > 0) {
    avisos.push(
      `${semMatricula.ocorrencias} abastecimento(s) sem matrícula, no valor de `
      + `${semMatricula.total.toFixed(2)} €. Não foram atribuídos a nenhum carro — reveja à mão.`,
    );
  }

  return { porMatricula, semMatricula, totalLido, totalDeclarado: null, confere, avisos };
}
