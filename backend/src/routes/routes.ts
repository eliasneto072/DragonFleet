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
import { permissionsRouter } from '../modules/permissions/permissions.routes';
import { requireArea } from '../middlewares/area.middleware';

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

// As permissões vivem à parte das áreas que protegem: quem perdeu o acesso a
// tudo tem de continuar a poder perguntar o que pode, senão o painel não sabe
// sequer que menu desenhar.
router.use('/permissions', permissionsRouter())

router.use('/users', requireArea('DRIVERS'), usersRouter())
router.use('/vehicles', requireArea('FLEET'), vehiclesRouter())
router.use('/earnings', requireArea('SETTLEMENTS'), earningsRouter())
router.use('/withdrawals', requireArea('FINANCIAL'), withdrawalsRouter())
router.use('/documents', requireArea('DOCUMENTS'), documentsRouter())
router.use('/notifications', requireArea('NOTIFICATIONS'), notificationsRouter())
router.use('/upload', uploadRoutes);
router.use('/analytics', requireArea('ANALYTICS'), analyticsRouter());
router.use('/support', requireArea('SUPPORT'), supportRouter());
router.use('/reports', requireArea('FINANCIAL'), reportsRouter());
router.use('/settings', requireArea('SETTINGS'), settingsRouter());
router.use('/balance', requireArea('FINANCIAL'), balanceRouter());
router.use('/settlements', requireArea('SETTLEMENTS'), settlementsRouter());
router.use('/bank', requireArea('FINANCIAL'), bankRouter());
router.use('/companies', requireArea('GREEN_RECEIPTS'), companiesRouter());
router.use('/investments', requireArea('INVESTMENTS'), investmentsRouter());
router.use('/ranks', requireArea('RANKS'), ranksRouter());

export { router };