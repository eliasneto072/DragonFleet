"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawalsController = exports.WithdrawalsController = void 0;
const response_1 = require("../../shared/http/response");
const AppError_1 = require("../../shared/errors/AppError");
const withdrawals_service_1 = require("./withdrawals.service");
const withdrawals_schemas_1 = require("./withdrawals.schemas");
function getActor(req) {
    if (!req.user?.id) {
        throw new AppError_1.AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
    }
    return { id: req.user.id, role: req.user.role };
}
class WithdrawalsController {
    constructor() {
        this.list = async (req, res) => {
            const withdrawals = await withdrawals_service_1.withdrawalsService.list(getActor(req));
            return (0, response_1.ok)(res, { withdrawals });
        };
        this.listByUser = async (req, res) => {
            const parsed = withdrawals_schemas_1.userIdParamSchema.parse({ params: req.params });
            const withdrawals = await withdrawals_service_1.withdrawalsService.listByUser(getActor(req), parsed.params.userId);
            return (0, response_1.ok)(res, { withdrawals });
        };
        this.getById = async (req, res) => {
            const parsed = withdrawals_schemas_1.withdrawalIdParamSchema.parse({ params: req.params });
            const withdrawal = await withdrawals_service_1.withdrawalsService.getById(getActor(req), parsed.params.id);
            return (0, response_1.ok)(res, { withdrawal });
        };
        this.create = async (req, res) => {
            const parsed = withdrawals_schemas_1.createWithdrawalSchema.parse({ body: req.body });
            const actor = getActor(req);
            const withdrawal = await withdrawals_service_1.withdrawalsService.create(actor, actor.id, parsed.body);
            return (0, response_1.ok)(res, { withdrawal }, 201);
        };
        this.updateStatus = async (req, res) => {
            const parsed = withdrawals_schemas_1.updateWithdrawalStatusSchema.parse({
                params: req.params,
                body: req.body,
            });
            const withdrawal = await withdrawals_service_1.withdrawalsService.updateStatus(getActor(req), parsed.params.id, parsed.body);
            return (0, response_1.ok)(res, { withdrawal });
        };
        this.remove = async (req, res) => {
            const parsed = withdrawals_schemas_1.withdrawalIdParamSchema.parse({ params: req.params });
            await withdrawals_service_1.withdrawalsService.remove(getActor(req), parsed.params.id);
            return res.status(204).send();
        };
    }
}
exports.WithdrawalsController = WithdrawalsController;
exports.withdrawalsController = new WithdrawalsController();
