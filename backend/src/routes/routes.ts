import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { usersRouter } from '../modules/users/users.route';
import { vehiclesRouter } from '../modules/vehicles/vehicles.route';
import { earningsRoutes } from '../modules/earnings/earnings.route';


const router = Router();

router.use('/auth', authRouter());
router.use('/users', usersRouter());
router.use('/vehicles', vehiclesRouter());
router.use('/earnings', earningsRoutes())

export { router };