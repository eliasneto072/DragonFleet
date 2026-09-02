import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { router } from './routes/routes';
import { errorMiddleware } from './middlewares/error.middleware';

const app = express();

/**
 * Confia no cabeçalho do proxy — mas só num salto.
 *
 * No Render a aplicação não fala com o browser: fala com o balanceador, que
 * põe o IP real em X-Forwarded-For. Sem isto, `req.ip` é o do balanceador e
 * **todos os visitantes partilham o mesmo IP** aos olhos do rate limit abaixo:
 * o limite do site inteiro passa a ser o de uma pessoa, e a primeira dezena de
 * tentativas falhadas de qualquer um tranca o login para todos.
 *
 * O número 1 é deliberado. `trust proxy: true` aceita a cadeia toda, incluindo
 * o que o cliente escrever, e aí qualquer pessoa forja o seu próprio IP e o
 * limite deixa de existir. Um salto é o que há entre o Render e nós.
 */
app.set('trust proxy', 1);

/**
 * Cabeçalhos de segurança.
 *
 * Vem antes de tudo o resto de propósito: um cabeçalho que só é posto depois
 * de uma rota responder não chega a sair.
 *
 * A Content-Security-Policy fica desligada. O frontend é servido de outro
 * domínio (Cloudflare Pages), portanto a política que interessa é a de lá — e
 * uma CSP mal calibrada aqui bloquearia as respostas da API sem que ninguém
 * percebesse porquê. O resto do helmet (nosniff, frameguard, HSTS, referrer)
 * aplica-se e não tem contraindicação.
 */
app.use(helmet({ contentSecurityPolicy: false }));

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

/**
 * Limite de tentativas na autenticação.
 *
 * Sem isto nada impede alguém de experimentar palavras-passe em série contra
 * /auth/login. Uma lista das mil mais usadas leva segundos a percorrer, e o
 * sistema não guarda registo nem avisa ninguém — a conta cai em silêncio.
 *
 * Só as rotas de autenticação. Aplicar o limite à API inteira apanharia o uso
 * normal: uma tela do admin que carregue seis consultas ao abrir gastaria seis
 * do orçamento de quem trabalha depressa.
 *
 * `skipSuccessfulRequests` faz o orçamento contar apenas os FALHANÇOS. Quem
 * acerta na palavra-passe pode entrar e sair as vezes que quiser; quem erra
 * dez vezes em quinze minutos espera. É a diferença entre travar um ataque e
 * castigar quem tem várias sessões abertas.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    code: 'TOO_MANY_ATTEMPTS',
    message: 'Demasiadas tentativas. Tente novamente dentro de 15 minutos.',
  },
});

// O caminho tem de bater com o que o routes.ts monta (`/auth`), e apenas com
// as rotas onde se apresentam credenciais. O /auth/me e o /auth/logout já
// exigem um token válido e não são adivinháveis.
app.use('/auth/login', authLimiter);
app.use('/auth/refresh', authLimiter);
app.use('/users', (req, res, next) =>
  // O registo público é um POST /users sem autenticação. Fica sob o mesmo
  // limite: sem ele, dá para criar contas em série.
  req.method === 'POST' && !req.headers.authorization
    ? authLimiter(req, res, next)
    : next(),
);

app.use(router);

app.use(errorMiddleware);

export { app };
