import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../shared/errors/AppError';
import { logger } from '../shared/utils/logger';

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ ok: false, message: err.message, code: err.code });
  }

  // Erro de validação do zod.
  //
  // Sem este ramo, QUALQUER pedido mal formado devolvia 500 e a mensagem
  // "Internal server error" — em toda a API, não só numa rota. Um campo em
  // falta é culpa de quem envia, não do servidor, e a diferença importa: um 500
  // manda quem chama tentar outra vez ou reportar uma avaria, quando o que
  // precisa é de corrigir o corpo do pedido.
  //
  // Apanhado pelos testes de integração da receção da extensão, mas o defeito
  // era geral: todos os schemas do projeto estavam a devolver 500.
  if (err instanceof ZodError) {
    // O primeiro problema é o que interessa a quem lê. O caminho diz qual o
    // campo: ['body','rows'] vira "rows", que é o que aparece no formulário.
    const primeiro = err.issues[0];
    const campo = primeiro?.path.filter((p) => p !== 'body' && p !== 'params' && p !== 'query').join('.');

    return res.status(400).json({
      ok: false,
      message: campo ? `${campo}: ${primeiro.message}` : (primeiro?.message ?? 'Pedido inválido.'),
      code: 'VALIDATION_ERROR',
      // A lista completa para o cliente poder assinalar vários campos de uma
      // vez, em vez de os corrigir um a um.
      issues: err.issues.map((i) => ({
        field: i.path.filter((p) => p !== 'body' && p !== 'params' && p !== 'query').join('.'),
        message: i.message,
      })),
    });
  }

  logger.error(err);
  return res.status(500).json({ ok: false, message: 'Internal server error' });
};
