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
import { bankRouter } from '../modules/bank/bank.routes';
import { companiesRouter } from '../modules/companies/companies.routes';
import { investmentsRouter } from '../modules/investments/investments.routes';
import { ranksRouter } from '../modules/ranks/ranks.routes';
import { investorsRouter } from '../modules/investors/investors.routes';
import { denyInvestor } from '../middlewares/deny-investor.middleware';

const router = Router();

// ─── As duas rotas abertas a uma conta de investidor ───────────────────────
//
// Autenticação e o portal dele. Mais nada.
router.use('/auth', authRouter())
router.use('/investors', investorsRouter())

// ─── A partir daqui é a frota ──────────────────────────────────────────────
//
// Lista BRANCA: tudo o que estiver abaixo desta linha fica fechado a contas de
// investidor, incluindo rotas que ainda não existem. Uma rota nova nasce
// protegida sem ninguém se lembrar de a proteger — que é a única forma de isto
// se manter verdadeiro daqui a um ano.
router.use(denyInvestor)

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
router.use('/bank', bankRouter());
router.use('/companies', companiesRouter());
router.use('/investments', investmentsRouter());
router.use('/ranks', ranksRouter());

export { router };