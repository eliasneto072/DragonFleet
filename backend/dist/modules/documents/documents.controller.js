"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentsController = exports.DocumentsController = void 0;
const response_1 = require("../../shared/http/response");
const AppError_1 = require("../../shared/errors/AppError");
const documents_service_1 = require("./documents.service");
const upload_service_1 = require("../upload/upload.service.js");
const documents_schemas_1 = require("./documents.schemas");
const enums_1 = require("../../shared/types/enums");
function getActor(req) {
    if (!req.user?.id) {
        throw new AppError_1.AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
    }
    return {
        id: req.user.id,
        role: req.user.role,
    };
}
class DocumentsController {
    constructor() {
        this.list = async (req, res) => {
            const documents = await documents_service_1.documentsService.list(getActor(req));
            return (0, response_1.ok)(res, { documents });
        };
        this.getById = async (req, res) => {
            const parsed = documents_schemas_1.documentIdParamSchema.parse({ params: req.params });
            const document = await documents_service_1.documentsService.getById(getActor(req), parsed.params.id);
            return (0, response_1.ok)(res, { document });
        };
        this.create = async (req, res) => {
            // req.body vem do multipart, não precisa de Zod aqui
            const type = req.body?.type;
            if (!type || !Object.values(enums_1.DocumentType).includes(type)) {
                throw new AppError_1.AppError('Tipo de documento inválido ou ausente', 400, 'INVALID_DOCUMENT_TYPE');
            }
            if (!req.file) {
                throw new AppError_1.AppError('Arquivo não enviado', 400, 'MISSING_FILE');
            }
            const { fileUrl, fileKey } = await (0, upload_service_1.uploadToCloudinary)(req.file.buffer, req.file.mimetype, 'documents');
            const document = await documents_service_1.documentsService.create(getActor(req), {
                type: type,
                fileUrl,
                fileKey,
            });
            return (0, response_1.ok)(res, { document }, 201);
        };
        this.update = async (req, res) => {
            const parsed = documents_schemas_1.updateDocumentSchema.parse({
                params: req.params,
                body: req.body,
            });
            const document = await documents_service_1.documentsService.update(getActor(req), parsed.params.id, parsed.body);
            return (0, response_1.ok)(res, { document });
        };
        this.updateStatus = async (req, res) => {
            const parsed = documents_schemas_1.updateDocumentStatusSchema.parse({
                params: req.params,
                body: req.body,
            });
            const document = await documents_service_1.documentsService.updateStatus(getActor(req), parsed.params.id, parsed.body);
            return (0, response_1.ok)(res, { document });
        };
        this.remove = async (req, res) => {
            const parsed = documents_schemas_1.documentIdParamSchema.parse({ params: req.params });
            await documents_service_1.documentsService.remove(getActor(req), parsed.params.id);
            return res.status(204).send();
        };
    }
}
exports.DocumentsController = DocumentsController;
exports.documentsController = new DocumentsController();