// ============================
// modules/upload/upload.routes.ts
// ============================

import { Router } from 'express';

import { UploadController } from './upload.controller';

import { upload } from '../../middlewares/upload.middleware';
import { reporFrota } from '../../middlewares/escopo.middleware';

const uploadRoutes = Router();

const uploadController =
  new UploadController();

// POST /upload
uploadRoutes.post(
  '/',
  upload.single('image'), reporFrota,
  uploadController.upload
);

export { uploadRoutes };