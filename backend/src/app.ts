import express from 'express';
import cors from 'cors';
import { routes } from './routes';

// assertEnv();

const app = express();

//app.use(cors(corsOptions));
app.use(cors());
app.use(express.json());

// Routes will be imported here
app.use('/api', routes);

// Global error handler (keep last)
//app.use(errorMiddleware);

export default app;
