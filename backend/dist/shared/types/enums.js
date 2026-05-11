"use strict";
// src/models/enums.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.EarningPlatform = exports.VehicleStatus = exports.WithdrawalStatus = exports.DocumentStatus = exports.DocumentType = exports.UserStatus = exports.UserRole = void 0;
//export enum UserRole {
//ADMIN = "ADMIN",
//  DRIVER = "DRIVER",
//  MANAGER = "MANAGER",
//}
//
//export enum UserStatus {
//  ACTIVE = "ACTIVE",
//  INACTIVE = "INACTIVE",
//  BLOCKED = "BLOCKED",
//}
//
//export enum DocumentType {
//  CNH = "CNH",
//  CRLV = "CRLV",
//  RECIBO = "RECIBO",
//  OTHER = "OTHER",
//}
//
//export enum DocumentStatus {
//  PENDING = "PENDING",
//  APPROVED = "APPROVED",
//  REJECTED = "REJECTED",
//}
//
//export enum WithdrawalStatus {
//  PENDING = "PENDING",
//  APPROVED = "APPROVED",
//  REJECTED = "REJECTED",
//  PAID = "PAID",
//}
//
//export enum VehicleStatus {
//  ACTIVE = "ACTIVE",
//  INACTIVE = "INACTIVE",
//  MAINTENANCE = "MAINTENANCE",
//  SOLD = "SOLD"
//}
//
//export enum EarningPlatform {
//  UBER = 'UBER',
//  BOLT = 'BOLT',
//  FREE_NOW = 'FREE_NOW',
//  OTHER = 'OTHER',
//}
// src/shared/types/enums.ts
var client_1 = require("@prisma/client");
Object.defineProperty(exports, "UserRole", { enumerable: true, get: function () { return client_1.UserRole; } });
Object.defineProperty(exports, "UserStatus", { enumerable: true, get: function () { return client_1.UserStatus; } });
Object.defineProperty(exports, "DocumentType", { enumerable: true, get: function () { return client_1.DocumentType; } });
Object.defineProperty(exports, "DocumentStatus", { enumerable: true, get: function () { return client_1.DocumentStatus; } });
Object.defineProperty(exports, "WithdrawalStatus", { enumerable: true, get: function () { return client_1.WithdrawalStatus; } });
Object.defineProperty(exports, "VehicleStatus", { enumerable: true, get: function () { return client_1.VehicleStatus; } });
Object.defineProperty(exports, "EarningPlatform", { enumerable: true, get: function () { return client_1.EarningPlatform; } });
