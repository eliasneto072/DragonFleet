"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.earningsController = exports.EarningsController = void 0;
const response_1 = require("../../shared/http/response");
const AppError_1 = require("../../shared/errors/AppError");
const earnings_service_1 = require("./earnings.service");
const earnings_schemas_1 = require("./earnings.schemas");
function getActor(req) {
    if (!req.user?.id) {
        throw new AppError_1.AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
    }
    return { id: req.user.id, role: req.user.role };
}
class EarningsController {
    constructor() {
        this.list = async (req, res) => {
            const earnings = await earnings_service_1.earningsService.list(getActor(req));
            return (0, response_1.ok)(res, { earnings });
        };
        this.listByUser = async (req, res) => {
            const parsed = earnings_schemas_1.userIdParamSchema.parse({ params: req.params });
            const earnings = await earnings_service_1.earningsService.listByUser(getActor(req), parsed.params.userId);
            return (0, response_1.ok)(res, { earnings });
        };
        this.getById = async (req, res) => {
            const parsed = earnings_schemas_1.earningIdParamSchema.parse({ params: req.params });
            const earning = await earnings_service_1.earningsService.getById(getActor(req), parsed.params.id);
            return (0, response_1.ok)(res, { earning });
        };
        this.create = async (req, res) => {
            const parsed = earnings_schemas_1.createEarningSchema.parse({ body: req.body });
            const actor = getActor(req);
            // userId vem do token — admin pode sobrescrever passando userId no body
            const userId = parsed.body.userId ?? actor.id;
            const earning = await earnings_service_1.earningsService.create(actor, userId, {
                amount: parsed.body.amount,
                date: parsed.body.date,
                platform: parsed.body.platform,
            });
            return (0, response_1.ok)(res, { earning }, 201);
        };
        this.update = async (req, res) => {
            const parsed = earnings_schemas_1.updateEarningSchema.parse({
                params: req.params,
                body: req.body,
            });
            const earning = await earnings_service_1.earningsService.update(getActor(req), parsed.params.id, parsed.body);
            return (0, response_1.ok)(res, { earning });
        };
        this.remove = async (req, res) => {
            const parsed = earnings_schemas_1.earningIdParamSchema.parse({ params: req.params });
            await earnings_service_1.earningsService.remove(getActor(req), parsed.params.id);
            return res.status(204).send();
        };
    }
}
exports.EarningsController = EarningsController;
exports.earningsController = new EarningsController();
