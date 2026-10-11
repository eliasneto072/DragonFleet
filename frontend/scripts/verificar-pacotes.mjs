// scripts/verificar-pacotes.mjs
//
// Guarda contra um import de um pacote que não está instalado neste projeto.
//
// ─── O ERRO QUE ISTO APANHA ─────────────────────────────────────────────────
//
// O `npm run build` corre `tsc -b` antes do Vite, e o `tsc` verifica TUDO o
// que o tsconfig inclui. Um único import de um pacote que não está no
// `package.json` deste projeto não dá um aviso: faz o build inteiro parar com
//
//   error TS2307: Cannot find module 'X' or its corresponding type declarations
//
// e o site fica na versão anterior. Pior: o backend e o frontend publicam
// separados, por isso dá para ver um deploy verde e assumir que foi tudo.
//
// Aconteceu a sério. Um ficheiro de testes no frontend importou `vitest`, que
// está instalado no backend e não aqui. O servidor publicou, o site não, e a
// página nova ficou invisível sem nada a dizer porquê.
//
// ─── PORQUE É QUE O `tsc` LOCAL NÃO CHEGAVA ─────────────────────────────────
//
// Porque nesta máquina não há `node_modules`: o `tsc` não encontra pacote
// NENHUM, e todos os imports dão o mesmo TS2307. Como são centenas de falsos
// alarmes, a verificação local filtra esse erro inteiro — e com ele vai o
// único verdadeiro.
//
// Esta guarda não precisa dos pacotes instalados: compara a lista de imports
// com a lista do `package.json`, que é texto. É por isso que funciona onde o
// `tsc` não funciona.
//
// Correr com:  node scripts/verificar-pacotes.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { builtinModules } from 'node:module';

const RAIZ = 'src';

/**
 * Os ficheiros que o BUILD compila.
 *
 * Tem de bater com o `tsconfig.app.json`: inclui `src` e exclui os testes. Se
 * um dia essa lista mudar lá, muda aqui — senão esta guarda passa a verificar
 * uma coisa diferente da que parte o build, que é pior do que não existir.
 */
function ficheiros(dir) {
  const fora = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      fora.push(...ficheiros(caminho));
    } else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome)) {
      fora.push(caminho);
    }
  }
  return fora;
}

/** O nome do pacote, a partir do que está escrito no import. */
function pacoteDe(especificador) {
  // Relativos e os do projeto (`@/`) não são pacotes.
  if (especificador.startsWith('.') || especificador.startsWith('@/')) return null;
  if (especificador.startsWith('node:')) return null;

  const partes = especificador.split('/');
  // Com âmbito: `@tanstack/react-query` são duas partes.
  // Sem âmbito: `react-dom/client` é só `react-dom`.
  return especificador.startsWith('@') ? partes.slice(0, 2).join('/') : partes[0];
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const instalados = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
  ...builtinModules,
]);

// `import x from 'y'`, `import 'y'`, `export … from 'y'`, `import('y')`.
const IMPORTS = /(?:from\s+|import\s+|import\(\s*|require\(\s*)['"]([^'"]+)['"]/g;

const problemas = [];
let total = 0;

for (const f of ficheiros(RAIZ)) {
  const s = readFileSync(f, 'utf8');
  IMPORTS.lastIndex = 0;
  let m;

  while ((m = IMPORTS.exec(s)) !== null) {
    const pacote = pacoteDe(m[1]);
    if (!pacote) continue;
    total += 1;

    if (!instalados.has(pacote)) {
      const linha = s.slice(0, m.index).split('\n').length;
      problemas.push(`${f}:${linha} → '${pacote}'`);
    }
  }
}

if (problemas.length > 0) {
  const unicos = [...new Set(problemas)];
  console.error(
    `\n✗ ${unicos.length} import(s) de pacotes que NÃO estão no package.json deste projeto:\n`,
  );
  for (const p of unicos) console.error('  ' + p);
  console.error(
    '\nO `tsc -b` do build pára em cada um destes, e o site fica na versão\n'
    + 'anterior. Ou instala o pacote aqui, ou tira o import — ver a nota no\n'
    + 'topo deste ficheiro.\n',
  );
  process.exit(1);
}

console.log(`✓ ${total} imports de pacotes, todos instalados neste projeto`);
