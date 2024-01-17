import { IJobService } from "../interfaces/jobService";
import { ITaskService } from "../interfaces/taskService";
import { IWorkerService } from "../interfaces/workerService";
import { IQueueService } from "../interfaces/queueService";
import { partitionArray, processCsvFile } from "../utils/utils";
import { Task, TaskStatus } from "../models/task";
import { Mutex } from 'async-mutex';
import { JobStatus } from "../models/job";

// we are assuming we are always making progress here, the metrics have to be different if we want to handle major failures
const RESCHEDULING_COMPLETION_THRESHOLD = 0.75; // only think about rescheduling tasks for jobs that are 75% complete
const SUM = process.env.SUM == "true" || false;
const SUBSEQUENT_PARTITIONS = Number(process.env.SUBSEQUENT_PARTITIONS) || 2;

export class MasterService {
    private jobService: IJobService;
    private taskService: ITaskService;
    private workerService: IWorkerService;
    private queueService: IQueueService;
    private outputQueue: string;
    private workerQueue: string;
    private taskPartitionSize: number = 5;
    private retryInterval: number = 10000;
    private currentFiles: string[] = [];
    private mutexForCurrentFiles = new Mutex();

    // map job id to object which tracks total duration across completed tasks and number of completed tasks to keep a running average,
    // this is used in our scheduling stragegy to determine which task needs rescheduling
    private metrics = new Map<string, { totalCompletedDuration: number, totalCompleted: number }>();

    constructor(jobService: IJobService, taskService: ITaskService, workerService: IWorkerService, queueService: IQueueService, outputQueue: string, workerQueue: string, taskPartitionSize?: number) {
        this.jobService = jobService;
        this.taskService = taskService;
        this.workerService = workerService;
        this.queueService = queueService;
        this.outputQueue = outputQueue;
        this.workerQueue = workerQueue;
        this.taskPartitionSize = taskPartitionSize ? taskPartitionSize : this.taskPartitionSize;
        // this.startMonitoring();
    }

    async scheduleJob(input: string[]) {
        const job = this.jobService.addJob({
            input: input
        });
        console.log(`About to create job logging current state of files: ${this.currentFiles}`)
        console.log(`Job ${job.id} created`);
        // partition tasks into smaller chunks
        const tasks = partitionArray(input, this.taskPartitionSize).map((input: string[], index: number) => {
            return this.taskService.addTask({
                jobId: job.id,
                input: input
            });
        }
        );
        console.log(`Job ${job.id} partitioned into ${tasks.length} tasks`);
        console.log(`Sending ${tasks.length} tasks to worker queue ${this.workerQueue}`)
        await this.queueService.sendMessages(this.workerQueue, tasks);
        console.log(`Job ${job.id} started`);
        return job;
    }
    // Called by workers via API to acquire a task
    startTask(jobId: string, taskId: string) {
        const job = this.jobService.getJob(jobId);
        if (!job || job.status === JobStatus.COMPLETED) {
            // nothing to do, job doesn't exist
            console.warn(`Job ${jobId} does not exist or is already completed`);
            return null;
        }
        return this.taskService.startTask(taskId);
    }
    async completeTask(jobId: string, taskId: string, output: string[]) {
        const job = this.jobService.getJob(jobId);
        if (!job) {
            // nothing to do, job doesn't exist
            console.warn(`Job ${jobId} does not exist this is likely a bug`);
            return null;
        }
        const task = this.taskService.finishTask(taskId, output)
        if (!task) {
            console.warn(`Task ${taskId} does not exist or is already completed`);
            return null;
        }
        // update metrics
        let metrics = this.metrics.get(jobId);
        if (!metrics) {
            metrics = { totalCompletedDuration: 0, totalCompleted: 0 };
            this.metrics.set(jobId, metrics);
        }
        metrics.totalCompletedDuration += task.duration!;
        metrics.totalCompleted++;

        const release = await this.mutexForCurrentFiles.acquire()

        this.currentFiles = this.currentFiles.concat(output);

        console.log(`current files are ${this.currentFiles}`)

        if (this.currentFiles.length >= 2) {
            const task = this.taskService.addTask({
                jobId: job.id,
                input: this.currentFiles
            });
            console.log(`Sending ${JSON.stringify(task)} to worker queue ${this.workerQueue}`)
            await this.queueService.sendMessages(this.workerQueue, [task]);
            this.currentFiles = [];
        } else {
            const tasksForGivenJob = this.taskService.getTasks().filter(task => task.jobId === jobId);
            const completed = tasksForGivenJob.every(t => t.status === TaskStatus.COMPLETED);
            if (completed) {
                console.log(`I am done, I had to finish ${tasksForGivenJob.length} tasks`);
                const divisor = SUM ? 1 : job.input.length;
                console.log(this.currentFiles)
                const newKey = await processCsvFile(process.env.AWS_BUCKET_NAME!, this.currentFiles[0], divisor, `dynamofl-outputs/${jobId}.csv`);
                this.jobService.completeJob(jobId, [newKey]);
                this.currentFiles = [];
                await this.queueService.sendMessages(this.outputQueue, [newKey]);
            }
        }
        release()
    }
}
