import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { usersController } from "./users.controller";

export function usersRouter() {
    const router = Router()

    router.get('/', authMiddleware, usersController.list)
    // Lista completa, sem paginar. Existe para quem precisa mesmo de todos —
    // o emparelhamento de nomes da extensão. As telas usam a rota acima.
    router.get('/all', authMiddleware, usersController.listAllRaw)
    router.get('/:id', authMiddleware, usersController.getById)
    router.post('/',  usersController.create)
    router.patch('/:id', authMiddleware, usersController.update)
    router.delete('/:id', authMiddleware, usersController.remove)

    return router

}
