import { v4 as uuidv4 } from 'uuid';
import { Worker, WorkerStatus } from '../models/Worker';
import { IWorkerService } from '../interfaces/IWorkerService';

// this probably should implement an interface since this is launching workers on kubernetes
export class WorkerService implements IWorkerService {
    private numWorkers: number = 0;
    private workers: Map<string, Worker>;

    constructor() {
        this.workers = new Map<string, Worker>();
    };
    init(numWorkers: number): Worker[] {
        this.numWorkers = numWorkers;
        // TODO: launch workers on kubernetes
        const workers: Worker[] = [];
        for (let i = 0; i < this.numWorkers; i++) {
            const worker: Worker = {
                id: uuidv4(),
                status: WorkerStatus.IDLE
            };
            this.workers.set(worker.id, worker);
            workers.push(worker);
        }
        return workers;
    }
    getIdleWorkers(): Worker[] {
        return [...this.workers.values()].filter(worker => worker.status === WorkerStatus.IDLE);
    }
    getWorkers(): Worker[] {
        return [...this.workers.values()];
    }
    getBusyWorkers(): Worker[] {
        return [...this.workers.values()].filter(worker => worker.status === WorkerStatus.BUSY);
    }
    getNumWorkers(): number {
        return this.numWorkers;
    }
    updateWorkerStatus(workerId: string, status: WorkerStatus): Worker | null {
        const worker = this.workers.get(workerId);
        if (!worker) {
            return null;
        }
        const updatedWorker = { ...worker, status: status };
        this.workers.set(workerId, updatedWorker);
        return updatedWorker;
    }
}
