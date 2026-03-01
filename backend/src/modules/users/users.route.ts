import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { usersController } from "./users.controller";

const usersRouter = Router()

usersRouter.get('/', authMiddleware, usersController.list)
usersRouter.get('/:id', authMiddleware, usersController.getById)
usersRouter.post('/', authMiddleware, usersController.create)
usersRouter.patch('/:id', authMiddleware, usersController.update)
usersRouter.delete('/:id', authMiddleware, usersController.remove)

export {usersRouter}