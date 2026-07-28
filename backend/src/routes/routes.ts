import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { usersRouter } from '../modules/users/users.route';
import { vehiclesRouter } from '../modules/vehicles/vehicles.routes';
import { earningsRouter } from '../modules/earnings/earnings.routes';
import { withdrawalsRouter } from '../modules/withdrawals/withdrawals.routes';
import { documentsRouter } from '../modules/documents/documents.routes';
import { notificationsRouter } from '../modules/notifications/notifications.routes';
import { uploadRoutes } from '../modules/upload/upload.routes';
import { analyticsRouter } from '../modules/analytics/analytics.routes';
import { supportRouter } from '../modules/support/support.routes';
import { reportsRouter } from '../modules/reports/reports.routes';
import { settingsRouter } from '../modules/settings/settings.routes';
import { balanceRouter } from '../modules/balance/balance.routes';
import { settlementsRouter } from '../modules/settlements/settlements.routes';

const router = Router();

router.use('/auth', authRouter())
router.use('/users', usersRouter())
router.use('/vehicles', vehiclesRouter())
router.use('/earnings', earningsRouter())
router.use('/withdrawals', withdrawalsRouter())
router.use('/documents', documentsRouter())
router.use('/notifications', notificationsRouter())
router.use('/upload', uploadRoutes);
router.use('/analytics', analyticsRouter());
router.use('/support', supportRouter());
router.use('/reports', reportsRouter());
router.use('/settings', settingsRouter());
router.use('/balance', balanceRouter());
router.use('/settlements', settlementsRouter());

export { router };