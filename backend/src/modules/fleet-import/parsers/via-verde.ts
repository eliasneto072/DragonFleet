// src/modules/fleet-import/parsers/via-verde.ts
//
// O extrato de movimentos da Via Verde, em PDF.
//
// ─── COMO O DOCUMENTO ESTÁ FEITO ────────────────────────────────────────────
//
// Página 1: os totais por operador (Brisa, Lusoponte, ANA…) e, no topo, o
// total geral. Página 2 em diante: o detalhe, agrupado por identificador:
//
//   Identificador: 601073989480 Matrícula: BG-49-GP
//     ...cada portagem...
//     Total Identificador 33.39
//
// Só interessa a linha `Total Identificador` — o detalhe já vem somado por
// ele. Ler portagem a portagem daria o mesmo número com dez vezes mais
// maneiras de correr mal.
//
// ─── A VERIFICAÇÃO ──────────────────────────────────────────────────────────
//
// O documento declara `Total em Euros` no topo. A soma dos identificadores tem
// de lhe bater ao cêntimo. Num extrato real: 33,39 + 30,60 = 63,99, e o topo
// diz 63,99.
//
// É isto que torna seguro ler um PDF. Não preciso de confiar no leitor, porque
// o documento traz a resposta certa e eu comparo. Se a Via Verde mudar o
// desenho e eu passar a ler mal, a soma deixa de fechar e a importação recusa
// em vez de inventar despesas.
//
// CUIDADO com a primeira ocorrência: `Total em Euros` aparece muitas vezes na
// página 1, uma por operador. A PRIMEIRA é o total geral; as seguintes são
// parcelas. Apanhar a última daria o valor de um operador qualquer.
//
// ─── O DESFASAMENTO NÃO É DAQUI ─────────────────────────────────────────────
//
// A Via Verde só tem os movimentos completos 4 a 5 dias depois, por isso o
// fecho de uma semana usa o extrato da semana ANTERIOR. Essa regra é de quem
// escolhe as datas, não deste leitor: ele lê o que lhe derem.

import { cent, numeroPt, somaCent, MATRICULA } from './numeros';
import type { Leitura } from './tipos';

const IDENTIFICADOR = /Identificador:\s*(\d+)/;
const TOTAL_IDENTIFICADOR = /Total Identificador\s+([\d.,]+)/;
const TOTAL_GERAL = /Total em Euros\s+([\d.,]+)/;

export function lerViaVerde(texto: string): Leitura {
  const avisos: string[] = [];
  const linhas = (texto ?? '').split('\n');

  const mGeral = TOTAL_GERAL.exec(texto ?? '');
  const totalDeclarado = mGeral ? numeroPt(mGeral[1]) : null;

  const porMatriculaMap = new Map<string, number[]>();
  let semMatriculaValores: number[] = [];
  let atual: { matricula: string | null } | null = null;

  for (const linha of linhas) {
    const mId = IDENTIFICADOR.exec(linha);
    if (mId) {
      // A matrícula vem na MESMA linha do identificador. Quando falta, o
      // movimento existe e tem valor — só não se sabe de que carro é.
      const mMat = MATRICULA.exec(linha);
      atual = { matricula: mMat ? mMat[1] : null };
      continue;
    }

    const mTotal = TOTAL_IDENTIFICADOR.exec(linha);
    if (mTotal && atual) {
      const valor = numeroPt(mTotal[1]);
      if (valor === null) {
        avisos.push(`Não consegui ler o valor "${mTotal[1]}" num identificador.`);
        atual = null;
        continue;
      }
      if (atual.matricula) {
        const lista = porMatriculaMap.get(atual.matricula) ?? [];
        lista.push(valor);
        porMatriculaMap.set(atual.matricula, lista);
      } else {
        semMatriculaValores.push(valor);
      }
      atual = null;
    }
  }

  const porMatricula = [...porMatriculaMap.entries()]
    .map(([matricula, valores]) => ({ matricula, total: somaCent(valores) }))
    .sort((a, b) => a.matricula.localeCompare(b.matricula));

  const semMatricula = {
    total: somaCent(semMatriculaValores),
    ocorrencias: semMatriculaValores.length,
  };
  const totalLido = cent(
    somaCent(porMatricula.map((p) => p.total)) + semMatricula.total,
  );

  let confere = true;
  if (totalDeclarado === null) {
    confere = false;
    avisos.push('O PDF não traz o "Total em Euros" — sem ele não há como conferir a leitura.');
  } else if (cent(totalDeclarado) !== totalLido) {
    confere = false;
    avisos.push(
      `A soma por matrícula (${totalLido.toFixed(2)} €) não bate com o total do `
      + `documento (${totalDeclarado.toFixed(2)} €). O PDF pode ter mudado de formato.`,
    );
  }

  if (porMatricula.length === 0 && semMatricula.ocorrencias === 0) {
    avisos.push('Não encontrei nenhum identificador no PDF. Confirme que exportou o separador "Movimentos".');
  }

  if (semMatricula.ocorrencias > 0) {
    avisos.push(
      `${semMatricula.ocorrencias} movimento(s) sem matrícula, no valor de `
      + `${semMatricula.total.toFixed(2)} €. Não foram atribuídos a nenhum carro — reveja à mão.`,
    );
  }

  return { porMatricula, semMatricula, totalLido, totalDeclarado, confere, avisos };
}
