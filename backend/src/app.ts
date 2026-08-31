import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { router } from './routes/routes';
import { errorMiddleware } from './middlewares/error.middleware';

const app = express();

/**
 * CORS restrito à lista configurada.
 *
 * Estava `cors()` sem argumentos, que aceita qualquer origem. Num sistema com
 * sessão, isso permite que qualquer site faça pedidos autenticados em nome de
 * quem tenha o DragonFleet aberto noutro separador.
 *
 * Lista vazia — só possível fora de produção, o env.ts recusa-a lá — mantém o
 * comportamento aberto, que é o que se quer numa máquina local com o frontend
 * noutra porta e a extensão a chamar de um `chrome-extension://`.
 */
app.use(cors({
  origin: env.CORS_ORIGINS.length === 0 ? true : env.CORS_ORIGINS,
  credentials: true,
}));

app.use(express.json());

app.use(router);

app.use(errorMiddleware);

export { app };
