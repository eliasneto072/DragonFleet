"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vehiclesController = exports.VehiclesController = void 0;
const response_1 = require("../../shared/http/response");
const AppError_1 = require("../../shared/errors/AppError");
const vehicles_service_1 = require("./vehicles.service");
const vehicles_schemas_1 = require("./vehicles.schemas");
function getActor(req) {
    if (!req.user?.id) {
        throw new AppError_1.AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
    }
    return { id: req.user.id, role: req.user.role };
}
class VehiclesController {
    constructor() {
        this.list = async (req, res) => {
            const vehicles = await vehicles_service_1.vehiclesService.list(getActor(req));
            return (0, response_1.ok)(res, { vehicles });
        };
        this.listByUser = async (req, res) => {
            const parsed = vehicles_schemas_1.userIdParamSchema.parse({ params: req.params });
            const vehicles = await vehicles_service_1.vehiclesService.listByUser(getActor(req), parsed.params.userId);
            return (0, response_1.ok)(res, { vehicles });
        };
        this.getById = async (req, res) => {
            const parsed = vehicles_schemas_1.vehicleIdParamSchema.parse({ params: req.params });
            const vehicle = await vehicles_service_1.vehiclesService.getById(getActor(req), parsed.params.id);
            return (0, response_1.ok)(res, { vehicle });
        };
        this.create = async (req, res) => {
            const parsed = vehicles_schemas_1.createVehicleSchema.parse({ body: req.body });
            const actor = getActor(req);
            const userId = actor.id;
            const vehicle = await vehicles_service_1.vehiclesService.create(actor, userId, parsed.body);
            return (0, response_1.ok)(res, { vehicle }, 201);
        };
        this.update = async (req, res) => {
            const parsed = vehicles_schemas_1.updateVehicleSchema.parse({
                params: req.params,
                body: req.body,
            });
            const vehicle = await vehicles_service_1.vehiclesService.update(getActor(req), parsed.params.id, parsed.body);
            return (0, response_1.ok)(res, { vehicle });
        };
        this.remove = async (req, res) => {
            const parsed = vehicles_schemas_1.vehicleIdParamSchema.parse({ params: req.params });
            await vehicles_service_1.vehiclesService.remove(getActor(req), parsed.params.id);
            return res.status(204).send();
        };
    }
}
exports.VehiclesController = VehiclesController;
exports.vehiclesController = new VehiclesController();
