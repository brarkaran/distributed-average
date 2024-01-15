import aws from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export interface StorageStrategy {
    save(data: string, fileName: string): Promise<string>;
}

export class S3StorageStrategy implements StorageStrategy {
    private s3: aws.S3;
    private bucket: string;
    private basePath: string;

    constructor(bucket: string, basePath: string) {
        this.bucket = bucket;
        this.basePath = basePath;
        this.s3 = new aws.S3();
    }

    async save(data: string, fileName: string): Promise<string> {
        const path = join(this.basePath, fileName);
        const params = {
            Bucket: this.bucket,
            Key: path,
            Body: data
        };
        await this.s3.putObject(params).promise();
        return path;
    }
}

export class LocalStorageStrategy implements StorageStrategy {
    private basePath: string;

    constructor(basePath: string) {
        this.basePath = basePath;
        mkdir(basePath, { recursive: true }).catch(console.error);
    }

    async save(data: string, fileName: string): Promise<string> {
        const fullPath = join(this.basePath, fileName);
        await writeFile(fullPath, data);
        return fullPath;
    }
}

// FileGenerator class with strategy pattern
export class FileGenerator {
    private storageStrategy: StorageStrategy;

    constructor(storageStrategy: StorageStrategy) {
        this.storageStrategy = storageStrategy;
    }

    public async generateFiles(numberOfFiles: number, count: number, batchSize: number = 100): Promise<string[]> {
        let results: string[] = [];
        for (let i = 0; i < numberOfFiles; i += batchSize) {
            const batchPromises = [];
            for (let j = i; j < Math.min(i + batchSize, numberOfFiles); j++) {
                batchPromises.push(this.generateFile(count));
            }
            const batchResults = await Promise.all(batchPromises);
            results = results.concat(batchResults);
        }
        return results;
    }

    private async generateFile(count: number): Promise<string> {
        try {
            const file = Array.from({ length: count }, () => Math.random());
            const fileName = `${uuidv4()}.csv`;
            return await this.storageStrategy.save(file.join(','), fileName);
        } catch (error) {
            console.error('Error generating file:', error);
            throw error;
        }
    }
}