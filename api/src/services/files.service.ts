import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from 'stream';

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config('../.env');
}

if (process.env.AWS_REGION === undefined || process.env.AWS_ACCESS_KEY_ID === undefined || process.env.AWS_SECRET_ACCESS_KEY === undefined || process.env.AWS_S3_BUCKET === undefined) {
    throw new Error("Environment variables AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET need to be provided")
}
// Initialize S3 Client
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// Function to upload a file to S3
export const uploadFileToS3 = async (file: Express.Multer.File, fileId: string): Promise<string> => {
    const uploadParams = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: `input/${fileId}`,
        Body: file.buffer,
    };

    const command = new PutObjectCommand(uploadParams);
    const response = await s3Client.send(command);
    return file.originalname;
};

// Function to get a file from S3
export const getFileFromS3 = async (fileKey: string): Promise<Readable> => {
    const getParams = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: `input/${fileKey}`,
    };

    const command = new GetObjectCommand(getParams);
    const response = await s3Client.send(command);

    return response.Body as Readable;
};