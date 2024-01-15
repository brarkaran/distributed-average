import { IJobService } from "../interfaces/jobService";
import { ITaskService } from "../interfaces/taskService";
import { IWorkerService } from "../interfaces/workerService";
import { IQueueService } from "../interfaces/queueService";
import { partitionArray } from "../utils/utils";
import { TaskStatus } from "../models/task";
import { JobStatus } from "../models/job";

// TODO: Need some kind of job scheduler to handler worker failures
// TODO: Need metrics for job scheduler

export class MasterService {
    private jobService: IJobService;
    private taskService: ITaskService;
    private workerService: IWorkerService;
    private queueService: IQueueService;
    private outputQueue: string;
    private workerQueue: string;
    private taskPartitionSize: number = 5;
    private retryInterval: number = 1000;

    constructor(jobService: IJobService, taskService: ITaskService, workerService: IWorkerService, queueService: IQueueService, outputQueue: string, workerQueue: string, taskPartitionSize?: number) {
        this.jobService = jobService;
        this.taskService = taskService;
        this.workerService = workerService;
        this.queueService = queueService;
        this.outputQueue = outputQueue;
        this.workerQueue = workerQueue;
        this.taskPartitionSize = taskPartitionSize ? taskPartitionSize : this.taskPartitionSize;
    }

    async scheduleJob(input: string[]) {
        const job = this.jobService.addJob({
            input: input
        });
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
        if (!this.taskService.finishTask(taskId, output)) {
            console.warn(`Task ${taskId} does not exist or is already completed`);
            return null;
        }
        // check if job is complete 
        // TODO: this should be part of the task service
        const tasksForGivenJob = this.taskService.getTasks().filter(task => task.jobId === jobId);
        console.log(`tasks for job ${jobId}`)
        const completed = tasksForGivenJob.every(t => t.status === TaskStatus.COMPLETED);
        if (completed) {
            // collect task outputs
            const output = tasksForGivenJob.flatMap(t => t.output || []);
            if (output.length == 1) {
                // no more rounds of reduction needed, job is complete
                this.jobService.completeJob(jobId, output);
                await this.queueService.sendMessages(this.outputQueue, output);
            } else {
                // more rounds of reduction needed, create new tasks for this job
                const tasks = partitionArray(output, this.taskPartitionSize).map((input: string[], index: number) => {
                    return this.taskService.addTask({
                        jobId: job.id,
                        input: input
                    });
                }
                );
                await this.queueService.sendMessages(this.workerQueue, tasks);
            }
            // round of reduction is complete, delete those tasks
            tasksForGivenJob.forEach(task => this.taskService.removeTask(task.id));
        }
    }

    // startMonitoring() {
    //     setInterval(() => {
    //         this.checkAndRetryTasks();
    //     }, this.retryInterval);
    // }

    // private async checkAndRetryTasks() {
    //     const tasks = await this.taskService.getTasks();
    //     tasks.forEach(task => {
    //         if (this.shouldRetry(task)) {
    //             this.retryTask(task);
    //         }
    //     });
    // }
}