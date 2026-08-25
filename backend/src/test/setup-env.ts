// src/test/setup-env.ts
//
// Corre ANTES de qualquer ficheiro de teste ser importado, e é isso que o torna
// necessário.
//
// ─── O PROBLEMA QUE ISTO RESOLVE ─────────────────────────────────────────────
//
// O `config/prisma.ts` constrói o cliente da aplicação no momento em que é
// importado, lendo o DATABASE_URL que estiver definido nessa altura. Sem este
// ficheiro, a aplicação ligava-se à base de DESENVOLVIMENTO enquanto as
// fábricas escreviam na de testes.
//
// O sintoma era enganador: os pedidos respondiam 404 e WITHDRAWAL_NOT_FOUND,
// como se as regras estivessem partidas. Estavam a olhar para o sítio errado.
//
// Pior ainda, alguns testes PASSAVAM — os que verificavam que nada tinha
// mudado, ou que aceitavam qualquer erro. Passavam pela razão errada, que é o
// modo de falha mais perigoso de uma suite: dá confiança sem dar cobertura.
//
// ─── A ORDEM É TUDO ──────────────────────────────────────────────────────────
//
// Definir aqui funciona porque o `dotenv` NÃO sobrepõe variáveis já existentes.
// O `.env` do projeto continua a ser lido, mas o DATABASE_URL que ele traz é
// ignorado por já estar definido.

import { TEST_DATABASE_URL, assertTestDatabase } from './db-url';

assertTestDatabase(TEST_DATABASE_URL);

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
