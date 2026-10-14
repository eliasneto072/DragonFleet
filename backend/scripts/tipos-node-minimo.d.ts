// scripts/tipos-node-minimo.d.ts
//
// ─── ESTE FICHEIRO NUNCA PODE ESTAR DENTRO DE `src/` ────────────────────────
//
// Ele REDECLARA o `Buffer`. Dentro de `src/` entrava no `include` do
// `tsconfig.json` e passava a substituir o Buffer verdadeiro no build de
// produção — que é a avaria mais estúpida possível: um ficheiro que existe
// para apanhar erros de tipos a causar erros de tipos em todo o projeto.
//
// Vive em `scripts/`, que o `tsconfig.json` não inclui, e é passado ao `tsc`
// à mão pela verificação local.
//
// ─── O QUE É ──────────────────────────────────────────────────────────────
//
// Um substituto mínimo dos tipos do Node, com o `Buffer` GENÉRICO como o
// @types/node moderno o declara. Usa o lib do TypeScript para os globais
// (Array, RegExp, Uint8Array, ArrayBuffer) e só acrescenta o Buffer e os
// módulos do Node.
//
// Serve para reproduzir, sem node_modules, os erros de atribuição entre
// Buffer<ArrayBuffer> (o que o Buffer.from devolve) e Buffer<ArrayBufferLike>
// (o que o zlib e o crypto devolvem).

interface Buffer<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike>
  extends Uint8Array<TArrayBuffer> {
  toString(encoding?: string, start?: number, end?: number): string;
  subarray(begin?: number, end?: number): Buffer<TArrayBuffer>;
  writeInt32LE(value: number, offset?: number): number;
  readonly length: number;
}

declare var Buffer: {
  from(s: string, encoding?: string): Buffer<ArrayBuffer>;
  from(a: readonly number[] | Uint8Array): Buffer<ArrayBuffer>;
  alloc(n: number): Buffer<ArrayBuffer>;
  concat(list: readonly Uint8Array[]): Buffer<ArrayBuffer>;
  isBuffer(o: unknown): boolean;
};

declare module 'node:zlib' {
  // O ponto todo: o zlib devolve o tipo LARGO.
  export function inflateSync(data: Uint8Array): Buffer<ArrayBufferLike>;
  export function inflateRawSync(data: Uint8Array): Buffer<ArrayBufferLike>;
}

declare module 'node:crypto' {
  interface Hash { update(d: Uint8Array | string): Hash; digest(): Buffer<ArrayBufferLike> }
  export function createHash(a: string): Hash;
  interface Decipher {
    setAutoPadding(b: boolean): Decipher;
    update(d: Uint8Array): Buffer<ArrayBufferLike>;
    final(): Buffer<ArrayBufferLike>;
  }
  export function createDecipheriv(alg: string, key: Uint8Array, iv: Uint8Array): Decipher;
}

// ─── Globais do Node que o lib do TypeScript não traz ───────────────────────
//
// Não é por rigor: é para o resultado desta verificação ser LEGÍVEL. Sem eles,
// cada `console.log` do projeto dava um erro e os dois ou três erros que
// interessam ficavam perdidos entre trezentos que não interessam. Um aviso que
// obriga a procurar é um aviso que se ignora.
declare var console: {
  log(...a: unknown[]): void;
  error(...a: unknown[]): void;
  warn(...a: unknown[]): void;
  info(...a: unknown[]): void;
};
declare var process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit(code?: number): never;
  cwd(): string;
};
declare var __dirname: string;
declare var __filename: string;
declare function setTimeout(fn: () => void, ms?: number): unknown;
declare function clearTimeout(h: unknown): void;
declare function setInterval(fn: () => void, ms?: number): unknown;
declare function clearInterval(h: unknown): void;
