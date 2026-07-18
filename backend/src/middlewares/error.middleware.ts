import type { ErrorRequestHandler } from 'express';
import { AppError } from '../shared/errors/AppError';
import { logger } from '../shared/utils/logger';

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ ok: false, message: err.message, code: err.code });
  }

  logger.error(err);
  return res.status(500).json({ ok: false, message: 'Internal server error' });
};
