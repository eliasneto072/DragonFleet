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

// ─── SEM EMAILS ──────────────────────────────────────────────────────────────
//
// A suite estava a chamar a API da Resend a sério em cada aprovação de
// retirada. Três problemas, e nenhum deles é pequeno:
//
//   - lentidão e dependência de rede num teste que devia ser local;
//   - gasto de quota de um serviço pago para não verificar nada;
//   - e o risco que interessa: um teste com um endereço real enviava-lhe mesmo
//     um email. Hoje só não aconteceu porque a Resend está em modo de teste e
//     recusou os destinatários fictícios.
//
// Apagar a chave desliga o envio na origem: o dispatch() do email.service
// deteta a ausência e regista em vez de enviar. Não é preciso substituir o
// serviço por uma imitação.
process.env.RESEND_API_KEY = '';

// ─── SEGREDOS DE TESTE ───────────────────────────────────────────────────────
//
// O env.ts passou a recusar segredos em falta quando NODE_ENV é production.
// Aqui é 'test', portanto os valores por omissão bastam — mas defini-los
// explicitamente documenta que os testes não dependem do .env de ninguém.
process.env.JWT_SECRET ||= 'segredo-de-teste-nao-usar-em-lado-nenhum-1234';
process.env.JWT_REFRESH_SECRET ||= 'segredo-de-refresh-de-teste-nao-usar-5678';
