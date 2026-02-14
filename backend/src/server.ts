import app from './app';
import { env } from './config/env';
import { logger } from './shared/ultils/logger';


app.listen(env.PORT, () => {
  logger.info(`API running on http://localhost:${env.PORT}`);
});