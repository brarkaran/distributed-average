import express from 'express';
import multer from 'multer';
import { uploadFile, getFile } from '../controllers/fileController';

const router = express.Router();
const upload = multer();

router.post('/api/files/:fileId', upload.single('file'), uploadFile);
router.get('/api/files/:fileId', getFile);

export default router;
