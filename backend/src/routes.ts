import { Router } from "express";




export const routes = Router()


routes.get('/health', (_req, res) => res.json({ ok: true, message: 'DragonFleet API is up' }));