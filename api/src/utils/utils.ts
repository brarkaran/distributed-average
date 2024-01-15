import * as AWS from 'aws-sdk';
import * as parse from 'csv-parse/lib/sync';
import * as stringify from 'csv-stringify/lib/sync';

const s3 = new AWS.S3();

export function partitionArray<T>(inputArray: T[], size: number): T[][] {
    return inputArray.reduce((accumulator: T[][], currentValue, currentIndex) => {
        if (currentIndex % size === 0) {
            accumulator.push([currentValue]);
        } else {
            accumulator[accumulator.length - 1].push(currentValue);
        }
        return accumulator;
    }, []);
}

export async function processCsvFile(bucket: string, key: string, divisor: number, newKey: string): Promise<string> {
    const file = await s3.getObject({ Bucket: bucket, Key: key }).promise();

    const records = parse(file.Body?.toString(), {
        columns: true,
        skip_empty_lines: true
    });

    const processedRecords = records.map((record: any) => {
        const processedRecord: any = {};
        for (const [key, value] of Object.entries(record)) {
            processedRecord[key] = !isNaN(value as number) ? Number(value) / divisor : value;
        }
        return processedRecord;
    });

    const csv = stringify(processedRecords, { header: true });

    await s3.putObject({
        Bucket: bucket,
        Key: newKey,
        Body: csv
    }).promise();
    return newKey;
}
