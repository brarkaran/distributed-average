import { v4 as uuidv4 } from 'uuid';
import { Worker, WorkerStatus } from '../models/worker';
import { IWorkerService } from '../interfaces/workerService';
import * as k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

export class WorkerService implements IWorkerService {
    private numWorkers: number = 0;
    private workers: Map<string, Worker>;

    constructor() {
        this.workers = new Map<string, Worker>();
    };
    async init(numWorkers: number): Promise<Worker[]> {
        this.numWorkers = numWorkers;
        const workerIds = Array.from({ length: numWorkers }, () => uuidv4());
        // randomly select one worker to simulate slow processing
        await Promise.all(workerIds.map(async (workerId, index) => createPod(workerId, index === Math.floor(Math.random() * numWorkers))));
        console.log(`Created ${workerIds.length} workers`);
        workerIds.forEach((workerId) => {
            this.workers.set(workerId, {
                id: workerId,
                status: WorkerStatus.IDLE
            });
        });
        return [...this.workers.values()];
    }
    async deactivate(): Promise<Worker[]> {
        const workerIds = [...this.workers.keys()];
        await Promise.all(workerIds.map(async (workerId) => {
            await k8sApi.deleteNamespacedPod(`worker-${workerId}`, 'default');
        }));
        console.log(`Deleted ${workerIds.length} workers`);
        this.workers.clear();
        this.numWorkers = 0;
        return [...this.workers.values()];
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
    getWorkers(): Worker[] {
        return [...this.workers.values()];
    }
}

const createPod = async (podId: string, simulateSlow: boolean) => {
    const podManifest = {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { name: `worker-${podId}`, labels: { role: "worker" } },
        spec: {
            containers: [{
                name: 'workers',
                image: 'neoatom/workers:latest',
                env: [
                    { name: 'WORKER_ID', value: podId },
                    { name: 'AM_I_SLOW', value: 'false' },
                    {
                        name: 'API_HOST',
                        value: 'http://api:8000'
                    }, {
                        name: 'PYTHONUNBUFFERED',
                        value: '1'
                    }, {
                        name: 'AWS_REGION',
                        value: 'us-east-1'
                    }, {
                        name: 'AWS_BUCKET_NAME',
                        value: process.env.AWS_BUCKET_NAME!
                    }, {
                        name: 'AWS_ACCESS_KEY_ID',
                        valueFrom: {
                            secretKeyRef: {
                                name: 'aws-secret',
                                key: 'AWS_ACCESS_KEY_ID'
                            }
                        }
                    }, {
                        name: 'AWS_SECRET_ACCESS_KEY',
                        valueFrom: {
                            secretKeyRef: {
                                name: 'aws-secret',
                                key: 'AWS_SECRET_ACCESS_KEY'
                            }
                        }
                    }]
            }],
            imagePullSecrets: [{
                name: 'regcred'
            }]
        }
    };
    return await k8sApi.createNamespacedPod('default', podManifest);
}
