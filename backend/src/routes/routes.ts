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
import { systemRouter } from '../modules/system/system.routes';
import { invitesRouter } from '../modules/invites/invites.routes';
import { meuPlanoRouter } from '../modules/plan-requests/meu-plano.routes';
import { leadsRouter, publicoRouter } from '../modules/leads/leads.routes';
import { requireArea } from '../middlewares/area.middleware';
import { lerSessaoSeHouver } from '../middlewares/auth.middleware';
import { escopoDaFrota } from '../middlewares/escopo.middleware';
import {
  exigeFuncionalidade, bloquearEscritaSeExpirada, soDaCasa,
} from '../middlewares/plano.middleware';

const router = Router();

// ─── A frota de quem está a pedir ──────────────────────────────────────────
//
// Antes de TUDO. A partir daqui, cada consulta deste pedido sabe a que frota
// pertence o que vai ler ou escrever — e as que não souberem rebentam, de
// propósito (ver `config/escopo.ts`).
//
// Corre também nas rotas públicas, onde não faz nada: sem sessão não há frota
// a definir, e as públicas que leem a base de dados — o login, o registo —
// declaram `comoSistema()` elas próprias.
//
// Repara que isto NÃO autentica ninguém. Quem exige sessão continua a ser o
// `authMiddleware` de cada router. Isto só lê o token, se existir, para saber
// a frota antes de o resto correr.
router.use(lerSessaoSeHouver, escopoDaFrota);

// ─── O formulário de contacto do site ──────────────────────────────────────
//
// Público, e tem de ser: quem o preenche não tem conta nenhuma. Fica aqui em
// cima, antes de qualquer muro — e antes do bloqueio da assinatura expirada,
// que nem se aplica, porque isto não pertence a frota nenhuma.
//
// O limite por IP está em `app.ts`. Sem ele, uma rota aberta sem limite
// enche-se numa noite.
router.use('/leads', leadsRouter())
// Os preços, para a página pública. Leitura e mais nada — e por isso fora do
// limite por IP do formulário, que é para a escrita.
router.use('/publico', publicoRouter())

// ─── As duas rotas abertas a uma conta de investidor ───────────────────────
//
// Autenticação e o portal dele. Mais nada.
router.use('/auth', authRouter())
// O portal do investidor E a gestão deles. Da casa: ver `soDaCasa`.
router.use('/investors', soDaCasa, investorsRouter())

// ─── O plano desta frota, visto pelo cliente ───────────────────────────────
//
// ACIMA do bloqueio da assinatura expirada, e é o ponto todo: uma frota
// expirada é precisamente quem precisa de poder pedir. Fechar esta porta a
// quem está trancado era fechar a porta de quem quer pagar.
//
// Sem `requireArea`: isto não é uma área do painel, é a conta da empresa. A
// guarda está lá dentro e é `requireAdmin` — quem muda de plano é quem paga.
router.use('/meu-plano', meuPlanoRouter())

// ─── Assinatura expirada: daqui para baixo, só se lê ───────────────────────
//
// DEPOIS do /auth de propósito: entrar, sair e renovar a sessão continuam a
// funcionar numa frota expirada. Trancar o login era trancar a pessoa fora dos
// dados dela próprios, que é precisamente o que esta regra existe para evitar.
//
// Os /investors ficam acima por serem da casa, que nunca expira.
//
// Uma guarda só, e não uma por rota: "escrever" é tudo o que não for GET, e
// posta aqui uma rota nova nasce protegida sem ninguém se lembrar disso.
router.use(bloquearEscritaSeExpirada)

// ─── O portal da oficina ───────────────────────────────────────────────────
//
// As marcações vivem ACIMA do muro porque são a ÚNICA coisa que uma conta de
// mecânico pode abrir. O investidor continua fechado também a esta, e lá
// dentro o serviço filtra por oficina — um mecânico não vê as marcações da
// oficina do lado.
//
// `requireArea` constrange só quem é da equipa, por isso o mecânico atravessa-a
// como um motorista atravessa, e o staff continua a precisar da área da frota.
router.use('/bookings', denyInvestor, requireArea('FLEET'), exigeFuncionalidade('OFICINA'), bookingsRouter())

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

// ─── O painel do dono da plataforma ────────────────────────────────────────
//
// SEM `requireArea`, e isso não é um esquecimento: as áreas são as do painel
// de uma frota, e isto não é uma área de nenhuma frota — é a lista das frotas.
// A guarda está lá dentro (`painelDoDono`), e é mais apertada do que qualquer
// área: ser ADMIN não chega, porque cada frota cliente tem o ADMIN dela.
router.use('/system', systemRouter())

router.use('/users', requireArea('DRIVERS'), exigeFuncionalidade('DRIVERS'), usersRouter())
// Os convites inscrevem motoristas, por isso vivem sob a área dos motoristas —
// e no nível MANAGE: gerar um link que mete gente dentro da frota é mexer na
// frota, não consultá-la. Quem só vê a lista de motoristas não convida ninguém.
router.use('/invites', requireArea('DRIVERS', 'MANAGE'), exigeFuncionalidade('DRIVERS'), invitesRouter())
router.use('/vehicles', requireArea('FLEET'), exigeFuncionalidade('FLEET'), vehiclesRouter())
// O material é material dos carros, por isso vive sob a área da frota. Os
// preços de compra não são para os motoristas — a recusa está no serviço,
// porque o `requireArea` deixa passar quem não é da equipa.
router.use('/materials', requireArea('FLEET'), exigeFuncionalidade('MATERIAL'), materialsRouter())
router.use('/earnings', requireArea('SETTLEMENTS'), exigeFuncionalidade('SETTLEMENTS'), earningsRouter())
router.use('/withdrawals', requireArea('FINANCIAL'), exigeFuncionalidade('FINANCIAL'), withdrawalsRouter())
router.use('/documents', requireArea('DOCUMENTS'), exigeFuncionalidade('DOCUMENTS'), documentsRouter())
router.use('/notifications', requireArea('NOTIFICATIONS'), exigeFuncionalidade('NOTIFICATIONS'), notificationsRouter())
router.use('/upload', uploadRoutes);
router.use('/analytics', requireArea('ANALYTICS'), exigeFuncionalidade('ANALYTICS'), analyticsRouter());
router.use('/support', requireArea('SUPPORT'), exigeFuncionalidade('SUPPORT'), supportRouter());
router.use('/reports', requireArea('FINANCIAL'), exigeFuncionalidade('FINANCIAL'), reportsRouter());
router.use('/settings', requireArea('SETTINGS'), exigeFuncionalidade('SETTINGS'), settingsRouter());
router.use('/balance', requireArea('FINANCIAL'), exigeFuncionalidade('FINANCIAL'), balanceRouter());
router.use('/settlements', requireArea('SETTLEMENTS'), exigeFuncionalidade('SETTLEMENTS'), settlementsRouter());
// A importação de despesas cria fechos, por isso vive sob a mesma área. O
// `requireArea` mais fino (MANAGE) está dentro do router: aqui basta a porta.
router.use('/fleet-import', requireArea('SETTLEMENTS'), exigeFuncionalidade('IMPORTAR'), fleetImportRouter());
router.use('/bank', requireArea('FINANCIAL'), exigeFuncionalidade('FINANCIAL'), bankRouter());
router.use('/companies', requireArea('GREEN_RECEIPTS'), exigeFuncionalidade('GREEN_RECEIPTS'), companiesRouter());
// Os investimentos, os investidores e os projetos são da casa: não estão no
// catálogo dos planos, e nenhuma frota cliente lhes chega. Ver `soDaCasa`.
router.use('/investments', soDaCasa, requireArea('INVESTMENTS'), investmentsRouter());
router.use('/ranks', requireArea('RANKS'), exigeFuncionalidade('RANKS'), ranksRouter());
// Os agendamentos mexem no saldo, por isso vivem sob a mesma área que o resto
// do dinheiro. Quem não pode lançar um ajuste à mão também não pode agendar um.
router.use('/scheduled-payments', requireArea('FINANCIAL'), exigeFuncionalidade('AGENDAMENTOS'), scheduledPaymentsRouter());
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