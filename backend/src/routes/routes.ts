import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { usersRouter } from '../modules/users/users.route';
import { vehiclesRouter } from '../modules/vehicles/vehicles.routes';
import { earningsRouter } from '../modules/earnings/earnings.routes';
import { withdrawalsRouter } from '../modules/withdrawals/withdrawals.routes';
import { documentsRouter } from '../modules/documents/documents.routes';


const router = Router();

router.use('/auth', authRouter())
router.use('/users', usersRouter())
router.use('/vehicles', vehiclesRouter())
router.use('/earnings', earningsRouter())
router.use('/withdrawals', withdrawalsRouter())
router.use('/documents', documentsRouter())

export { router };