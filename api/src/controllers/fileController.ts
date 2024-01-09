import { Request, Response } from 'express';
import { uploadFileToS3, getFileFromS3 } from '../services/files.service';

export const uploadFile = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).send('No file uploaded.');
        }

        const result = await uploadFileToS3(req.file, req.params.fileId);
        res.status(200).send(`File uploaded successfully: ${result}`);
    } catch (error) {
        res.status(500).send('Error uploading the file.');
    }
};

export const getFile = async (req: Request, res: Response) => {
    try {
        const fileKey = req.params.fileId;
        const fileStream = await getFileFromS3(fileKey);

        fileStream.pipe(res);
    } catch (error) {
        console.log(JSON.stringify(error))
        res.status(500).send('Error retrieving the file.');
    }
};
