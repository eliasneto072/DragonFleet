"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = exports.AuthController = void 0;
const response_1 = require("../../shared/http/response");
const AppError_1 = require("../../shared/errors/AppError");
const auth_service_1 = require("./auth.service");
const auth_schemas_1 = require("./auth.schemas");
function getUserId(req) {
    if (!req.user?.id) {
        throw new AppError_1.AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
    }
    return req.user.id;
}
class AuthController {
    constructor() {
        this.login = async (req, res) => {
            const parsed = auth_schemas_1.loginSchema.parse({ body: req.body });
            const result = await auth_service_1.authService.login({
                email: parsed.body.email,
                password: parsed.body.password,
            });
            return (0, response_1.ok)(res, result);
        };
        this.logout = async (_req, res) => {
            await auth_service_1.authService.logout();
            return (0, response_1.ok)(res, { message: 'Logged out successfully' });
        };
        this.me = async (req, res) => {
            const user = await auth_service_1.authService.me(getUserId(req));
            return (0, response_1.ok)(res, { user });
        };
    }
}
exports.AuthController = AuthController;
exports.authController = new AuthController();
