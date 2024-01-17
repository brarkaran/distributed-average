import { IJobService } from "../interfaces/jobService";
import { ITaskService } from "../interfaces/taskService";
import { IWorkerService } from "../interfaces/workerService";
import { IQueueService } from "../interfaces/queueService";
import { partitionArray, processCsvFile } from "../utils/utils";
import { Task, TaskStatus } from "../models/task";
import { JobStatus } from "../models/job";

// we are assuming we are always making progress here, the metrics have to be different if we want to handle major failures
const RESCHEDULING_COMPLETION_THRESHOLD = 0.75; // only think about rescheduling tasks for jobs that are 75% complete
const SUM = process.env.SUM == "true" || false;

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
                console.log("I am done")
                const divisor = SUM ? 1 : job.input.length;
                console.log(this.currentFiles)
                const newKey = await processCsvFile(process.env.AWS_BUCKET_NAME!, this.currentFiles[0], divisor, `dynamofl-outputs/${jobId}.csv`);
                this.jobService.completeJob(jobId, [newKey]);
                this.currentFiles = [];
                await this.queueService.sendMessages(this.outputQueue, [newKey]);
            }
        }

        // check if job is complete
        // TODO: this should be part of the task service
        // const tasksForGivenJob = this.taskService.getTasks().filter(task => task.jobId === jobId);
        // console.log(`tasks for job ${jobId}`)
        // const completed = tasksForGivenJob.every(t => t.status === TaskStatus.COMPLETED);
        // if (completed) {
        //     // collect task outputs
        //     const output = tasksForGivenJob.flatMap(t => t.output || []);
        //     if (output.length == 1) {
        //         // no more rounds of reduction needed, job is complete after dividing by number of files
        //         // this is REALLY hacky, but it works for now - I apologise, future me
        //         // Tasks should have had a "round" type field from the start - SUM or DIVIDE
        //         const divisor = job.input.length;
        //         const newKey = await processCsvFile(process.env.AWS_BUCKET_NAME!, output[0], divisor, `dynamofl-outputs/${jobId}.csv`);
        //         this.jobService.completeJob(jobId, [newKey]);
        //         await this.queueService.sendMessages(this.outputQueue, [newKey]);
        //     } else {
        //         // more rounds of reduction needed, create new tasks for this job
        //         const tasks = partitionArray(output, this.taskPartitionSize).map((input: string[], index: number) => {
        //             return this.taskService.addTask({
        //                 jobId: job.id,
        //                 input: input
        //             });
        //         }
        //         );
        //         await this.queueService.sendMessages(this.workerQueue, tasks);
        //     }
        //     // round of reduction is complete, delete those tasks
        //     tasksForGivenJob.forEach(task => this.taskService.removeTask(task.id));
        // }
    }
    // async completeTask(jobId: string, taskId: string, output: string[]) {
    //     const job = this.jobService.getJob(jobId);
    //     if (!job) {
    //         // nothing to do, job doesn't exist
    //         console.warn(`Job ${jobId} does not exist this is likely a bug`);
    //         return null;
    //     }
    //     const task = this.taskService.finishTask(taskId, output)
    //     if (!task) {
    //         console.warn(`Task ${taskId} does not exist or is already completed`);
    //         return null;
    //     }
    //     // update metrics
    //     let metrics = this.metrics.get(jobId);
    //     if (!metrics) {
    //         metrics = { totalCompletedDuration: 0, totalCompleted: 0 };
    //         this.metrics.set(jobId, metrics);
    //     }
    //     metrics.totalCompletedDuration += task.duration!;
    //     metrics.totalCompleted++;
    //     // check if job is complete
    //     // TODO: this should be part of the task service
    //     const tasksForGivenJob = this.taskService.getTasks().filter(task => task.jobId === jobId);
    //     console.log(`tasks for job ${jobId}`)
    //     const completed = tasksForGivenJob.every(t => t.status === TaskStatus.COMPLETED);
    //     if (completed) {
    //         // collect task outputs
    //         const output = tasksForGivenJob.flatMap(t => t.output || []);
    //         if (output.length == 1) {
    //             // no more rounds of reduction needed, job is complete after dividing by number of files
    //             // this is REALLY hacky, but it works for now - I apologise, future me
    //             // Tasks should have had a "round" type field from the start - SUM or DIVIDE
    //             const divisor = job.input.length;
    //             const newKey = await processCsvFile(process.env.AWS_BUCKET_NAME!, output[0], divisor, `dynamofl-outputs/${jobId}.csv`);
    //             this.jobService.completeJob(jobId, [newKey]);
    //             await this.queueService.sendMessages(this.outputQueue, [newKey]);
    //         } else {
    //             // more rounds of reduction needed, create new tasks for this job
    //             const tasks = partitionArray(output, this.taskPartitionSize).map((input: string[], index: number) => {
    //                 return this.taskService.addTask({
    //                     jobId: job.id,
    //                     input: input
    //                 });
    //             }
    //             );
    //             await this.queueService.sendMessages(this.workerQueue, tasks);
    //         }
    //         // round of reduction is complete, delete those tasks
    //         tasksForGivenJob.forEach(task => this.taskService.removeTask(task.id));
    //     }
    // }
    // getLongRunningTasks(): Task[] {
    //     console.log("Getting long running tasks");
    //     const potentialTasks: Task[] = [];
    //     const incompleteJobs = this.jobService.getJobs().filter(job => job.status !== JobStatus.COMPLETED);
    //     const incompleteTasks = incompleteJobs.flatMap(job => this.taskService.getTasksForJob(job.id).filter(task => task.status !== TaskStatus.COMPLETED && task.status !== TaskStatus.PENDING));
    //     incompleteTasks.forEach(task => {
    //         const metrics = this.metrics.get(task.jobId);
    //         // only reschedule tasks for jobs that are almost complete
    //         // total tasks will be close to this number
    //         const totalTasks = (this.jobService.getJob(task.jobId)!.input.length - 1) / (this.taskPartitionSize - 1)
    //         if (!metrics || metrics.totalCompleted < RESCHEDULING_COMPLETION_THRESHOLD * totalTasks) {
    //             return [];
    //         }
    //         // if current task is taking longer than average, reschedule it
    //         if (1.5 * (new Date().getTime() - task.startTime!) > metrics!.totalCompletedDuration / metrics!.totalCompleted) {
    //             potentialTasks.push(task);
    //         }
    //     }
    //     );
    //     return potentialTasks;
    // }
    // async retryTasks(tasks: Task[]) {
    //     console.log(`Retrying ${tasks.length} tasks`);
    //     tasks.forEach(task => {
    //         this.taskService.updateTask(task.id, { status: TaskStatus.PENDING });
    //     });
    //     await this.queueService.sendMessages(this.workerQueue, tasks);
    // }
    // startMonitoring() {
    //     setInterval(() => {
    //         console.log("Monitoring long running tasks");
    //         const longRunningTasks = this.getLongRunningTasks();
    //         console.log(`Found ${longRunningTasks.length} long running tasks`);
    //         if (longRunningTasks.length > 0) {
    //             console.log(`Retrying ${longRunningTasks} tasks`);
    //             this.retryTasks(longRunningTasks);
    //         } else {
    //             console.log(`No long running tasks found`);
    //         }
    //     }, this.retryInterval);
    // }
}
