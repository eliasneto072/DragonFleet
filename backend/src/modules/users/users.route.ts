import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { usersController } from "./users.controller";

export function usersRouter() {
    const router = Router()

    router.get('/', authMiddleware, usersController.list)
    router.get('/:id', authMiddleware, usersController.getById)
    router.post('/',  usersController.create)
    router.patch('/:id', authMiddleware, usersController.update)
    router.delete('/:id', authMiddleware, usersController.remove)

    return router

}
