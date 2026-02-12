import express from 'express';
import cors from 'cors';

const app = express();

app.use(cors());
app.use(express.json());

// Routes will be imported here
// app.use('/api', routes);

export default app;
