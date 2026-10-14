// src/modules/fleet-import/pdf/objstm.ts
//
// Abrir os objetos que estão guardados DENTRO de outro objeto.
//
// ─── PORQUE É QUE ISTO É NECESSÁRIO ─────────────────────────────────────────
//
// O extrator encontra objetos a varrer o ficheiro à procura de `12 0 obj`. Num
// PDF de 2003 isso chega. Desde o PDF 1.5 há uma optimização chamada "object
// stream": vários objetos pequenos — catálogos, páginas, fontes — são metidos
// juntos dentro de um único stream comprimido. Varrer o ficheiro não os
// encontra, porque lá fora eles não existem.
//
// Era o que fazia o extrato pessoal do Abanca, o do Millennium e o da Revolut
// Business devolverem zero linhas: o texto estava todo lá, mas a lista de
// páginas estava dentro de um ObjStm e o extrator não achava uma única página.
//
// ─── O FORMATO ──────────────────────────────────────────────────────────────
//
// O stream, já descomprimido, é:
//
//   num1 desl1 num2 desl2 ... numN deslN   ← /N pares, até ao byte /First
//   <corpo do objeto 1><corpo do objeto 2>...
//
// Os deslocamentos são relativos ao /First. O corpo de cada objeto acaba onde
// começa o seguinte — e o último acaba no fim do stream.
//
// ─── O QUE ISTO NÃO FAZ ─────────────────────────────────────────────────────
//
// Não lê a tabela de referências (`/Type /XRef`). Não precisa: os objetos são
// encontrados pelo varrimento e pelos ObjStm, e a tabela só serviria para os
// localizar mais depressa. Um objeto que exista em duas versões no mesmo
// ficheiro fica na versão mais recente, porque o varrimento vai do início para
// o fim e a última escrita ganha.

/**
 * Os objetos que vivem dentro dos ObjStm, prontos a juntar ao mapa.
 *
 * `corpoDoStream` recebe o número do objeto e devolve o stream já
 * descomprimido (e já desencriptado, se for o caso) — ou `null`. Fica fora
 * desta função de propósito: a descompressão e a desencriptação já vivem no
 * extrator, e duplicá-las aqui era pedir que divergissem.
 */
export function objetosDentroDeStreams(
  objs: Map<number, string>,
  corpoDoStream: (num: number) => string | null,
): Map<number, string> {
  const achados = new Map<number, string>();

  for (const [num, corpo] of objs) {
    if (!/\/Type\s*\/ObjStm/.test(corpo)) continue;

    const n = Number(/\/N\s+(\d+)/.exec(corpo)?.[1] ?? 0);
    const first = Number(/\/First\s+(\d+)/.exec(corpo)?.[1] ?? -1);
    if (n <= 0 || first < 0) continue;

    const dados = corpoDoStream(num);
    if (!dados) continue;

    const cabecalho = dados.slice(0, first);
    const numeros = cabecalho.match(/-?\d+/g);
    if (!numeros || numeros.length < n * 2) continue;

    // Primeiro os pares todos, e só depois os corpos: o fim de cada objeto é o
    // começo do seguinte, e para saber isso é preciso ter a lista inteira.
    const pares: { num: number; desl: number }[] = [];
    for (let i = 0; i < n; i++) {
      pares.push({ num: Number(numeros[i * 2]), desl: Number(numeros[i * 2 + 1]) });
    }

    for (let i = 0; i < pares.length; i++) {
      const inicio = first + pares[i].desl;
      const fim = i + 1 < pares.length ? first + pares[i + 1].desl : dados.length;
      if (inicio < 0 || fim > dados.length || fim <= inicio) continue;
      // Um objeto que o varrimento já encontrou fora NÃO é substituído: lá
      // fora ele é mais recente do que dentro de um ObjStm antigo.
      if (objs.has(pares[i].num)) continue;
      achados.set(pares[i].num, dados.slice(inicio, fim));
    }
  }

  return achados;
}
