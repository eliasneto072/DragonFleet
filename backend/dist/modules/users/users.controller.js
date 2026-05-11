"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersController = exports.UsersController = void 0;
const response_1 = require("../../shared/http/response");
const AppError_1 = require("../../shared/errors/AppError");
const users_service_1 = require("./users.service");
const users_schemas_1 = require("./users.schemas");
function getActor(req) {
    if (!req.user?.id) {
        throw new AppError_1.AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
    }
    return {
        id: req.user.id,
        role: req.user.role,
    };
}
class UsersController {
    constructor() {
        this.list = async (req, res) => {
            const users = await users_service_1.usersService.list(getActor(req));
            return (0, response_1.ok)(res, { users });
        };
        this.getById = async (req, res) => {
            const parsed = users_schemas_1.userIdParamSchema.parse({ params: req.params });
            const user = await users_service_1.usersService.getById(getActor(req), parsed.params.id);
            return (0, response_1.ok)(res, { user });
        };
        this.create = async (req, res) => {
            const parsed = users_schemas_1.createUserSchema.parse({ body: req.body });
            const user = await users_service_1.usersService.create(parsed.body);
            return (0, response_1.ok)(res, { user }, 201);
        };
        this.update = async (req, res) => {
            const parsed = users_schemas_1.updateUserSchema.parse({
                params: req.params,
                body: req.body,
            });
            const user = await users_service_1.usersService.update(getActor(req), parsed.params.id, parsed.body);
            return (0, response_1.ok)(res, { user });
        };
        this.remove = async (req, res) => {
            const parsed = users_schemas_1.userIdParamSchema.parse({ params: req.params });
            await users_service_1.usersService.remove(getActor(req), parsed.params.id);
            return res.status(204).send();
        };
    }
}
exports.UsersController = UsersController;
exports.usersController = new UsersController();
