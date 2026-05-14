"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentsService = exports.DocumentsService = void 0;
const AppError_1 = require("../../shared/errors/AppError");
const enums_1 = require("../../shared/types/enums");
const users_repository_1 = require("../users/users.repository");
const documents_repository_1 = require("./documents.repository");
function isAdmin(role) {
    return role === enums_1.UserRole.ADMIN;
}
function isManager(role) {
    return role === enums_1.UserRole.MANAGER;
}
function canManageDocuments(role) {
    return isAdmin(role) || isManager(role);
}
class DocumentsService {
    async ensureDocumentExists(id) {
        const doc = await documents_repository_1.documentsRepository.findById(id);
        if (!doc) {
            throw new AppError_1.AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
        }
        return doc;
    }
    async ensureUserExists(userId) {
        const user = await users_repository_1.usersRepository.findById(userId);
        if (!user) {
            throw new AppError_1.AppError('User not found', 404, 'USER_NOT_FOUND');
        }
    }
    ensureOwnerOrManager(actor, ownerId) {
        if (!canManageDocuments(actor.role) && actor.id !== ownerId) {
            throw new AppError_1.AppError('Forbidden', 403, 'FORBIDDEN');
        }
    }
    async list(actor) {
        if (canManageDocuments(actor.role)) {
            return documents_repository_1.documentsRepository.findAll();
        }
        return documents_repository_1.documentsRepository.findByUserId(actor.id);
    }
    async getById(actor, id) {
        const doc = await this.ensureDocumentExists(id);
        this.ensureOwnerOrManager(actor, doc.userId);
        return doc;
    }
    async create(actor, input) {
        // agora sempre cria para o dono do token
        await this.ensureUserExists(actor.id);
        const existing = await documents_repository_1.documentsRepository.findByUserIdAndType(actor.id, input.type);
        if (existing) {
            throw new AppError_1.AppError('Document type already exists for this user', 409, 'DOCUMENT_TYPE_ALREADY_EXISTS');
        }
        const data = {
            type: input.type,
            fileUrl: input.fileUrl,
            fileKey: input.fileKey, //novo
            status: enums_1.DocumentStatus.PENDING,
            userId: actor.id,
        };
        return documents_repository_1.documentsRepository.create(data);
    }
    async update(actor, id, input) {
        const doc = await this.ensureDocumentExists(id);
        this.ensureOwnerOrManager(actor, doc.userId);
        // Driver só pode editar se estiver PENDING
        if (!canManageDocuments(actor.role) && doc.status !== enums_1.DocumentStatus.PENDING) {
            throw new AppError_1.AppError('Forbidden', 403, 'CANNOT_EDIT_DOCUMENT_AFTER_REVIEW');
        }
        // Se trocar o type, garantir que não vai duplicar (mesmo userId + type)
        if (input.type && input.type !== doc.type) {
            const existing = await documents_repository_1.documentsRepository.findByUserIdAndType(doc.userId, input.type);
            if (existing) {
                throw new AppError_1.AppError('Document type already exists for this user', 409, 'DOCUMENT_TYPE_ALREADY_EXISTS');
            }
        }
        const data = {
            ...(input.type !== undefined ? { type: input.type } : {}),
            ...(input.fileUrl !== undefined ? { fileUrl: input.fileUrl } : {}),
        };
        return documents_repository_1.documentsRepository.update(id, data);
    }
    async updateStatus(actor, id, input) {
        if (!canManageDocuments(actor.role)) {
            throw new AppError_1.AppError('Forbidden', 403, 'FORBIDDEN');
        }
        await this.ensureDocumentExists(id);
        const data = {
            status: input.status,
        };
        return documents_repository_1.documentsRepository.update(id, data);
    }
    async remove(actor, id) {
        if (!canManageDocuments(actor.role)) {
            throw new AppError_1.AppError('Forbidden', 403, 'FORBIDDEN');
        }
        await this.ensureDocumentExists(id);
        return documents_repository_1.documentsRepository.delete(id);
    }
}
exports.DocumentsService = DocumentsService;
exports.documentsService = new DocumentsService();
