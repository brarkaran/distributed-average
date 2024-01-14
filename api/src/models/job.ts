export enum JobStatus {
    PENDING = 'PENDING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED'
}

export interface Job {
    id: string;
    input: string[];
    startTime?: number;
    endTime?: number;
    duration?: number;
    status: JobStatus;
    output?: string[];
}