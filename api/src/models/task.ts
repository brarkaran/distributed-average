export enum TaskStatus {
    PENDING = 'PENDING',
    IN_PROGRESS = 'IN_PROGRESS',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED'
}

export interface Task {
    id: string;
    jobId: string;
    input: string[];
    status: TaskStatus;
    startTime?: number;
    endTime?: number;
    duration?: number;
    output?: string[];
}