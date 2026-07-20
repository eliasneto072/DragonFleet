import { DocumentType, DocumentStatus } from "../../shared/types/enums"
import { IUserPublic } from "../users/users.types"

export interface IDocument {
    id: string
    type: DocumentType
    fileUrl: string
    fileKey: string
    notes?: string | null
    status: DocumentStatus
    issuedAt?: Date | null
    expiresAt?: Date | null
    userId: string
    vehicleId?: string | null
    createdAt: Date
    updatedAt: Date
}

export type IDocumentPublic = IDocument

export type IDocumentWithUser = IDocument & {
    user?: IUserPublic
} 