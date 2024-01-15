import aws from 'aws-sdk';

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

// horrible things happen here
export async function processCsvFile(bucket: string, key: string, divisor: number, newKey: string): Promise<string> {
    console.log(`Processing file ${key} in bucket ${bucket}`);
    const s3Client = new aws.S3();
    const params = {
        Bucket: bucket,
        Key: key
    };
    const data = await (new aws.S3()).getObject(params).promise();
    if (!data.Body) {
        throw new Error("File not readable");
    }
    const fileContent = data.Body.toString('utf-8');
    const numbers = fileContent.split(/,\s*/)?.map(num => parseFloat(num) / divisor);

    const csv = numbers.join(',');
    const putObjectParams = {
        Bucket: bucket,
        Key: newKey,
        Body: csv
    };
    await s3Client.putObject(putObjectParams).promise();
    return newKey;
}
