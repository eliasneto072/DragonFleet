// src/modules/fleet-import/parsers/prio-electric.ts
//
// Os carregamentos elétricos, do portal MyPrio (Transações Electric).
//
// ─── ESTE É O FÁCIL: UMA LINHA POR CARREGAMENTO ─────────────────────────────
//
//   31/08/2026 18:26:20 PTPRIO6087… DIOGO TESLA MODEL 3 BT-63-NU PTEDP639… SNT-00105 10.51 9.1 2.68 0.01 5.52 6.79 7117235550
//   └ data     └ hora  └ cartão    └ nome do cartão    └ matrícula            energia dur. OPC IEC └Total └c/IVA └fatura
//
// As colunas contam-se **do fim para o princípio** e não do princípio: o nome
// do cartão tem espaços ("DIOGO TESLA MODEL 3" são quatro palavras, "Diogo
// steam VirtualCard" são três), por isso a posição de tudo o que vem a seguir
// varia de linha para linha. Do fim, a fatura é sempre a última e o resto está
// sempre no mesmo sítio.
//
// ─── A ARMADILHA DO IVA ─────────────────────────────────────────────────────
//
// Há aqui uma coluna chamada `Total` e outra `Total c/ IVA`:
//
//   Total 5,52    Total c/IVA 6,79
//
// A que interessa é a SEGUNDA — é o que saiu da conta. No ficheiro do
// combustível a coluna chamada `Total` já inclui IVA; aqui não. Mesmo nome,
// sentido oposto.
//
// Lida a coluna errada, os carros elétricos ficavam com a despesa 23% abaixo,
// todas as semanas, sem nada no ecrã a denunciar — e a diferença passava para
// o lucro como se fosse ganho.
//
// ─── A VERIFICAÇÃO ──────────────────────────────────────────────────────────
//
// Como no combustível, o PDF não traz total. Mas cada linha traz as duas
// colunas, e a razão entre elas é o IVA: 5,52 × 1,23 = 6,79. Se o leitor
// escorregar uma coluna, a razão deixa de ser 1,23 e a importação recusa.

import { cent, numeroPt, somaCent, MATRICULA } from './numeros';
import type { Leitura } from './tipos';

const COMECA_COM_DATA = /^\d{2}\/\d{2}\/\d{4}/;
/** 23% à data. Se mudar, muda aqui — e as leituras antigas continuam válidas. */
const IVA = 1.23;

interface Carregamento {
  matricula: string | null;
  semIva: number | null;
  comIva: number;
}

export function lerPrioElectric(texto: string): Leitura {
  const avisos: string[] = [];
  const carregamentos: Carregamento[] = [];

  for (const linha of (texto ?? '').split('\n')) {
    if (!COMECA_COM_DATA.test(linha.trim())) continue;

    const campos = linha.trim().split(/\s+/);
    if (campos.length < 6) continue;

    // Do fim: [-1] fatura, [-2] total c/IVA, [-3] total, [-4] IEC, [-5] custo OPC.
    const comIva = numeroPt(campos[campos.length - 2] ?? '');
    const semIva = numeroPt(campos[campos.length - 3] ?? '');
    if (comIva === null) continue;

    const mMat = MATRICULA.exec(linha);
    carregamentos.push({ matricula: mMat ? mMat[1] : null, semIva, comIva });
  }

  // ── A conferência: em cada linha, sem IVA × 1,23 = com IVA ───────────────
  let desalinhadas = 0;
  for (const c of carregamentos) {
    if (c.semIva === null) continue;
    // Dois cêntimos de tolerância: a Prio arredonda cada linha, e num
    // carregamento de 0,14 € o arredondamento pesa mais do que a percentagem.
    if (Math.abs(cent(c.semIva * IVA) - cent(c.comIva)) > 0.02) desalinhadas += 1;
  }

  const porMatriculaMap = new Map<string, number[]>();
  const semValores: number[] = [];
  for (const c of carregamentos) {
    if (c.matricula) {
      const lista = porMatriculaMap.get(c.matricula) ?? [];
      lista.push(c.comIva);
      porMatriculaMap.set(c.matricula, lista);
    } else {
      semValores.push(c.comIva);
    }
  }

  const porMatricula = [...porMatriculaMap.entries()]
    .map(([matricula, valores]) => ({ matricula, total: somaCent(valores) }))
    .sort((a, b) => a.matricula.localeCompare(b.matricula));

  const semMatricula = { total: somaCent(semValores), ocorrencias: semValores.length };
  const totalLido = cent(somaCent(porMatricula.map((p) => p.total)) + semMatricula.total);

  let confere = true;
  if (carregamentos.length === 0) {
    confere = false;
    avisos.push('Não encontrei nenhum carregamento no PDF. Confirme que exportou "Transações Electric".');
  }
  if (desalinhadas > 0) {
    confere = false;
    avisos.push(
      `${desalinhadas} de ${carregamentos.length} linhas não fecham a conta do IVA. `
      + 'O ficheiro da Prio pode ter mudado de formato — não importei nada.',
    );
  }
  if (semMatricula.ocorrencias > 0) {
    avisos.push(
      `${semMatricula.ocorrencias} carregamento(s) sem matrícula, no valor de `
      + `${semMatricula.total.toFixed(2)} €. Não foram atribuídos a nenhum carro — reveja à mão.`,
    );
  }

  return { porMatricula, semMatricula, totalLido, totalDeclarado: null, confere, avisos };
}
