import { v4 as uuidv4 } from 'uuid';
import { Worker, WorkerStatus } from '../models/worker';

export interface IWorkerService {
    init(numWorkers: number): Worker[];
    getIdleWorkers(): Worker[];
    getBusyWorkers(): Worker[];
    getNumWorkers(): number;
    getWorkers(): Worker[];
    updateWorkerStatus(workerId: string, status: WorkerStatus): Worker | null;
}
