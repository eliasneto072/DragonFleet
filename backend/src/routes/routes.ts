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
import { fleetImportRouter } from '../modules/fleet-import/fleet-import.routes';
import { bankRouter } from '../modules/bank/bank.routes';
import { companiesRouter } from '../modules/companies/companies.routes';
import { investmentsRouter } from '../modules/investments/investments.routes';
import { ranksRouter } from '../modules/ranks/ranks.routes';
import { investorsRouter } from '../modules/investors/investors.routes';
import { denyInvestor } from '../middlewares/deny-investor.middleware';
import { denyMechanic } from '../middlewares/deny-mechanic.middleware';
import { bookingsRouter } from '../modules/bookings/bookings.routes';
import { materialsRouter } from '../modules/materials/materials.routes';
import { permissionsRouter } from '../modules/permissions/permissions.routes';
import { scheduledPaymentsRouter } from '../modules/scheduled-payments/scheduled-payments.routes';
import { remindersRouter } from '../modules/reminders/reminders.routes';
import { pendingRouter } from '../modules/pending/pending.routes';
import { requireArea } from '../middlewares/area.middleware';

const router = Router();

// ─── As duas rotas abertas a uma conta de investidor ───────────────────────
//
// Autenticação e o portal dele. Mais nada.
router.use('/auth', authRouter())
router.use('/investors', investorsRouter())

// ─── O portal da oficina ───────────────────────────────────────────────────
//
// As marcações vivem ACIMA do muro porque são a ÚNICA coisa que uma conta de
// mecânico pode abrir. O investidor continua fechado também a esta, e lá
// dentro o serviço filtra por oficina — um mecânico não vê as marcações da
// oficina do lado.
//
// `requireArea` constrange só quem é da equipa, por isso o mecânico atravessa-a
// como um motorista atravessa, e o staff continua a precisar da área da frota.
router.use('/bookings', denyInvestor, requireArea('FLEET'), bookingsRouter())

// ─── A partir daqui é a frota ──────────────────────────────────────────────
//
// Lista BRANCA: tudo o que estiver abaixo desta linha fica fechado a contas de
// investidor, incluindo rotas que ainda não existem. Uma rota nova nasce
// protegida sem ninguém se lembrar de a proteger — que é a única forma de isto
// se manter verdadeiro daqui a um ano.
router.use(denyInvestor)
// E o mesmo para as contas de oficina: daqui para baixo, nada.
router.use(denyMechanic)

// As permissões vivem à parte das áreas que protegem: quem perdeu o acesso a
// tudo tem de continuar a poder perguntar o que pode, senão o painel não sabe
// sequer que menu desenhar.
router.use('/permissions', permissionsRouter())

router.use('/users', requireArea('DRIVERS'), usersRouter())
router.use('/vehicles', requireArea('FLEET'), vehiclesRouter())
// O material é material dos carros, por isso vive sob a área da frota. Os
// preços de compra não são para os motoristas — a recusa está no serviço,
// porque o `requireArea` deixa passar quem não é da equipa.
router.use('/materials', requireArea('FLEET'), materialsRouter())
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
// A importação de despesas cria fechos, por isso vive sob a mesma área. O
// `requireArea` mais fino (MANAGE) está dentro do router: aqui basta a porta.
router.use('/fleet-import', requireArea('SETTLEMENTS'), fleetImportRouter());
router.use('/bank', requireArea('FINANCIAL'), bankRouter());
router.use('/companies', requireArea('GREEN_RECEIPTS'), companiesRouter());
router.use('/investments', requireArea('INVESTMENTS'), investmentsRouter());
router.use('/ranks', requireArea('RANKS'), ranksRouter());
// Os agendamentos mexem no saldo, por isso vivem sob a mesma área que o resto
// do dinheiro. Quem não pode lançar um ajuste à mão também não pode agendar um.
router.use('/scheduled-payments', requireArea('FINANCIAL'), scheduledPaymentsRouter());
// Os lembretes são de cada um e não tocam em dados de ninguém — por isso vão
// sob o painel e não sob uma área de negócio. Quem vê o painel pode ter notas
// no painel.
router.use('/reminders', requireArea('DASHBOARD'), remindersRouter());
// O que falta fazer, em toda a aplicação. Sob o painel e não sob cada área:
// é UMA pergunta sobre todas elas, e o que cada pessoa vê é filtrado lá
// dentro pelas permissões dela. É também o que alimenta os números do menu,
// por isso tem de abrir a quem só tem o painel.
router.use('/pending', requireArea('DASHBOARD'), pendingRouter());

export { router };