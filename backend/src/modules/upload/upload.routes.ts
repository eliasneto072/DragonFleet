// ============================
// modules/upload/upload.routes.ts
// ============================

import { Router } from 'express';

import { UploadController } from './upload.controller';

import { upload } from '../../middlewares/upload.middleware';

const uploadRoutes = Router();

const uploadController =
  new UploadController();

// POST /upload
uploadRoutes.post(
  '/',
  upload.single('image'),
  uploadController.upload
);

export { uploadRoutes };