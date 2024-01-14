// master to schedule map reduce jobs
// uuid module
import { v4 as uuidv4 } from 'uuid';
import amqp from 'amqplib';



export class Master {
    private jobs: Array<any>;
    private numWorkers: number;
    private mode: "Distributed" | "Local";
    private workerQueue: string;
    private ouputQueue: string;

    constructor(mode: "Distributed" | "Local", numWorkers: number, outputQueue: string, workerQueue: string) {
        this.jobs = [];
        this.numWorkers = numWorkers;
        this.mode = mode;
        this.ouputQueue = outputQueue;
        this.workerQueue = workerQueue;
    }

    public async scheduleJob(input: string[]) {
        const jobId = uuidv4();
        const tasks = partitionArray(input, this.numWorkers).map((task, index) => {
            return {
                id: uuidv4(),
                jobId: jobId,
                input: task,
                status: "PENDING",
                // current time since epoch in milliseconds
                startTime: null,
                endTime: null,
            }
        });
        const job = {
            input: input,
            id: jobId,
            startTime: new Date().getTime(),
            endTime: null,
            tasks: tasks,
            status: "PENDING",
            output: []
        };
        this.jobs.push(job);
        if (this.mode === "Distributed") {
            await sendMessagesBatch(this.workerQueue, tasks);
        } else {
            // TODO: schedule tasks locally
        }
    }

    public async acquireTask(jobId: string, taskId: string) {
        const taskToUpdate = this.jobs
            .find(job => job.id === jobId)?.tasks
            .find((t: any) => t.id === taskId);

        if (!taskToUpdate || taskToUpdate.status === "COMPLETED") {
            return false;
        }

        Object.assign(taskToUpdate, {
            status: "STARTED",
            startTime: new Date().getTime()
        });

        return taskToUpdate;
    }

    public monitorTasks() {
        // function that checks if any tasks have been running for more than the average task completion time for the job, and if so
        // reschedules the tasks using speculative execution

    }

    public async completeTask(jobId: string, taskId: string, taskOutput: string[]) {
        // Find the job with the given jobId
        console.log(`Looking for job with id: ${jobId} and task id: ${taskId} in jobs`)
        const job = this.jobs.find(j => j.id === jobId);
        if (!job) {
            console.log("Job not found");
            return false;
        }

        // Find the task with the given taskId
        const task = job.tasks.find((t: any) => t.id === taskId);
        if (!task) {
            console.log("Task not found");
            return false;
        }

        // Update the task status and output
        task.status = "COMPLETED";
        task.endTime = new Date().getTime();
        task.duration = task.endTime - task.startTime;
        task.output = taskOutput;

        // Check if all tasks in the job are completed
        const allTasksCompleted = job.tasks.every((t:any) => t.status === "COMPLETED");

        if (allTasksCompleted) {
            let output = job.tasks.reduce((acc:any, t:any) => acc.concat(t.output), []);
            if (output.length === 1) {
                console.log(`Job completed with output: ${output[0]}`)
                output = output[0];
                job.output = output;
                job.status = "COMPLETED";
                job.endTime = new Date().getTime();
                job.duration = (job.endTime - job.startTime) / 1000;
                console.log(`Job completed ${JSON.stringify(job)} with output: ${output}`);
                await sendMessagesBatch(this.ouputQueue, [output]);
            } else {
                // schedule a new job with the output as input
                const tasks = partitionArray(output, this.numWorkers).map((task, index) => {
                    return {
                        id: uuidv4(),
                        jobId: jobId,
                        input: task,
                        status: "PENDING",
                        // current time since epoch in milliseconds
                        startTime: null,
                        endTime: null,
                    }
                }
                );
                job.tasks = tasks;
                if (this.mode === "Distributed") {
                    await sendMessagesBatch(this.workerQueue, tasks);
                } else {
                    // TODO: schedule tasks locally
                }
            }
        }
        return allTasksCompleted;
    }
}

const RABBIT = process.env.RABBIT!;

async function connectRabbitMQ() {
    const connection = await amqp.connect(RABBIT);
    const channel = await connection.createChannel();
    return channel;
}

export async function sendMessagesBatch(queue: string, messages: Array<any>) {
    const channel = await connectRabbitMQ();
    await channel.assertQueue(queue, {
        durable: true // Ensures that the queue is not lost even if RabbitMQ restarts
    });
    messages.forEach(message => {
        const msg = JSON.stringify(message); // Convert task object to string
        channel.sendToQueue(queue, Buffer.from(msg), {
            persistent: true // Marks message as persistent
        });
    });
    console.log(" [x] Sent '%d' messages in a batch", messages.length);
    setTimeout(() => {
        channel.close(); // Close channel after messages are sent
    }, 500);
}


function partitionArray<T>(inputArray: T[], size: number): T[][] {
    return inputArray.reduce((accumulator: T[][], currentValue, currentIndex) => {
        if (currentIndex % size === 0) {
            accumulator.push([currentValue]);
        } else {
            accumulator[accumulator.length - 1].push(currentValue);
        }
        return accumulator;
    }, []);
}
