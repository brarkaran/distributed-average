export enum WorkerStatus {
    IDLE = 'IDLE',
    BUSY = 'BUSY'
}

export interface Worker {
    id: string;
    status: WorkerStatus;
}