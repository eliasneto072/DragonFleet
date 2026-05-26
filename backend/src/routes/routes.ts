import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { usersRouter } from '../modules/users/users.route';
import { vehiclesRouter } from '../modules/vehicles/vehicles.routes';
import { earningsRouter } from '../modules/earnings/earnings.routes';
import { withdrawalsRouter } from '../modules/withdrawals/withdrawals.routes';
import { documentsRouter } from '../modules/documents/documents.routes';
import { notificationsRouter } from '../modules/notifications/notifications.routes';
import { uploadRoutes } from '../modules/upload/upload.routes';


const router = Router();

router.use('/auth', authRouter())
router.use('/users', usersRouter())
router.use('/vehicles', vehiclesRouter())
router.use('/earnings', earningsRouter())
router.use('/withdrawals', withdrawalsRouter())
router.use('/documents', documentsRouter())
router.use('/notifications', notificationsRouter())
router.use('/upload', uploadRoutes);

export { router };