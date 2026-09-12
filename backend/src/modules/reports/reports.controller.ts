// src/modules/reports/reports.controller.ts

import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { AppError } from '../../shared/errors/AppError';
import { reportsService } from './reports.service';
import { settlementsExportService } from './settlements-export.service';
import { receiptsExportService } from './receipts-export.service';

import { exportSettlementsSchema } from '../settlements/settlements.schemas';
import { parseDay } from '../settlements/settlements.service';
import { parseSearchTerms } from '../../shared/http/pagination';
import { SettlementStatus } from '../../shared/types/enums';
import { usersRepository } from '../users/users.repository';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export class ReportsController {
  // GET /reports/financial.pdf?from=2026-01-01&to=2026-06-30
  financialPdf = async (req: AuthRequest, res: Response) => {
    const { from, to } = req.query as { from?: string; to?: string };
    await reportsService.streamFinancialReport(getActor(req), res, { from, to });
    // service handles headers + stream; nothing else to return
  };


  // GET /reports/settlements.xlsx?from=&to=&userId=&status=&search=
  //
  // Os parametros sao os MESMOS da tela de Faturacao — vem do
  // settlementFiltersShape, partilhado com o listSettlementsSchema. Ver a nota
  // la: se divergirem, a tela e o ficheiro mostram totais diferentes e ninguem
  // sabe qual esta certo.
  settlementsXlsx = async (req: AuthRequest, res: Response) => {
    const actor = getActor(req);
    const { query } = exportSettlementsSchema.parse({ query: req.query });

    const filter = {
      userId: query.userId,
      status: query.status,
      from: query.from ? parseDay(query.from, 'from') : undefined,
      to: query.to ? parseDay(query.to, 'to') : undefined,
      terms: parseSearchTerms(query.search),
    };

    // Os filtros em texto, para a folha de resumo. E o que torna o ficheiro
    // reconciliavel quando dois exports discordarem.
    const ESTADO_PT: Record<string, string> = {
      [SettlementStatus.DRAFT]: 'Rascunho',
      [SettlementStatus.REGISTERED]: 'Registado',
      [SettlementStatus.CANCELLED]: 'Cancelado',
    };

    const filtrosLegiveis: Array<[string, string]> = [
      ['Periodo', query.from || query.to
        ? `${query.from ?? 'inicio'} a ${query.to ?? 'hoje'}`
        : 'Todo o historico'],
      ['Estado', query.status ? (ESTADO_PT[query.status] ?? query.status) : 'Todos'],
      ['Motorista', query.userId ? `filtrado (${query.userId})` : 'Todos'],
      ['Pesquisa', query.search?.trim() || '—'],
    ];

    // O nome de quem pediu, e nao o id, porque isto vai para a folha de resumo
    // e um cuid nao diz nada a quem abre o ficheiro daqui a seis meses. O
    // `AuthRequest.user` so tem id e role — o token nao carrega o nome.
    const quemPediu = await usersRepository.findById(actor.id);

    await settlementsExportService.streamXlsx(res, filter, {
      requestedBy: quemPediu?.name ?? actor.id,
      filtrosLegiveis,
    });
  };


  // GET /reports/receipts.xlsx?status=&search=&companyId=
  //
  // Os Recibos Verdes. O `companyId` aceita o valor especial UNCLASSIFIED, que
  // e o mesmo que a tela usa no seletor — o filtro vive no servidor desde que
  // deixou de ser aplicado sobre a pagina carregada.
  receiptsXlsx = async (req: AuthRequest, res: Response) => {
    const actor = getActor(req);

    const status = typeof req.query.status === 'string' ? req.query.status : 'PAID';
    const companyId = typeof req.query.companyId === 'string' && req.query.companyId
      ? req.query.companyId
      : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;

    // A etiqueta da sociedade NAO e resolvida aqui. Se o filtro apanhar uma so
    // sociedade, as linhas exportadas ja trazem o nome dela — o servico tira-o
    // dos dados e poupa uma consulta as sociedades so para obter um rotulo.
    const filtrosLegiveis: Array<[string, string]> = [
      ['Estado', status === 'PAID' ? 'Pago' : status],
      ['Pesquisa', search?.trim() || '—'],
    ];

    const quemPediu = await usersRepository.findById(actor.id);

    await receiptsExportService.streamXlsx(
      res,
      { status, companyId, terms: parseSearchTerms(search) },
      { requestedBy: quemPediu?.name ?? actor.id, filtrosLegiveis },
    );
  };

  // GET /reports/earnings.pdf?from=2026-07-01&to=2026-07-31[&userId=...]
  //
  // Sem userId, o extrato é do próprio requisitante. Passar userId só funciona
  // para admin/manager — o service rejeita qualquer outro caso.
  earningsPdf = async (req: AuthRequest, res: Response) => {
    const actor = getActor(req);
    const { from, to, userId } = req.query as {
      from?: string; to?: string; userId?: string;
    };
    await reportsService.streamDriverEarningsReport(actor, res, {
      userId: userId || actor.id,
      from,
      to,
    });
  };
}

export const reportsController = new ReportsController();