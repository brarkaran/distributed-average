import express, { Request, Response } from 'express';
import { KubeConfig, BatchV1Api, V1Job, V1alpha1ValidatingAdmissionPolicyBindingSpec } from '@kubernetes/client-node';
import fileRoutes from './routes/fileRoutes';
import bodyParser from 'body-parser'

import mongoose from 'mongoose';
import amqp from 'amqplib';
import { Db } from 'mongodb';
import { IMasterJob, MasterJob, MasterJobStatus } from './models/masterJob';
import { IJob, Job, JobStatus } from './models/job';
import { ITask, Task, TaskStatus } from './models/task';


if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config('../.env');
}

const app = express();
app.use(express.json());
app.use(bodyParser.json({ limit: '100gb' }));
app.use(bodyParser.urlencoded({ limit: '100gb', extended: true }));

const kubeConfig = new KubeConfig();
kubeConfig.loadFromDefault();
const k8sApi = kubeConfig.makeApiClient(BatchV1Api);

app.post('api/workers/', async (req: Request, res: Response) => {
    const numWorkers = req.body.numWorkers || 1;
    const jobName = `worker-job-${Date.now()}`;

    const jobManifest: V1Job = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
            name: jobName,
        },
        spec: {
            parallelism: numWorkers,
            template: {
                spec: {
                    containers: [{
                        name: 'worker',
                        image: 'redis', // Replace with your worker container image
                        // Add any other container configuration here
                    }],
                    restartPolicy: 'Never',
                },
            },
        },
    };

    try {
        await k8sApi.createNamespacedJob('default', jobManifest); // Replace 'default' with your namespace if different
        res.status(200).json({ message: `Job ${jobName} created with ${numWorkers} workers` });
    } catch (error) {
        console.error("Error creating Kubernetes job:", error);
        res.status(500).json({ error: "Failed to create job on Kubernetes cluster" });
    }
});


app.use(fileRoutes);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`API Server running on port ${PORT}`);
});

if (!process.env.DBHOST) {
    throw new Error("Please specify the databse host using environment variable DBHOST.");
}

if (!process.env.DBNAME) {
    throw new Error("Please specify the name of the database using environment variable DBNAME");
}

if (!process.env.RABBIT) {
    throw new Error("Please specify the name of the RabbitMQ host using environment variable RABBIT");
}

const DBHOST = process.env.DBHOST;
const DBNAME = process.env.DBNAME;
const RABBIT = process.env.RABBIT;

const MAX_TASK_PARTITION_SIZE = 5;


// MongoDB connection initialization
mongoose.connect(DBHOST)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Error connecting to MongoDB', err));


/**
 * Connects to RabbitMQ and returns the channel
 */
async function connectRabbitMQ() {
    const connection = await amqp.connect(RABBIT);
    const channel = await connection.createChannel();
    return channel;
}

async function updateTaskById(taskId: string, updateData: Partial<ITask>, session: mongoose.ClientSession | null = null) {
    try {
        const updatedTask = await Task.findOneAndUpdate(
            { _id: taskId },
            { $set: updateData },
            { new: true, session } // returns the updated document
        );

        if (!updatedTask) {
            throw new Error('Task not found');
        }

        return updatedTask;
    } catch (error) {
        console.error('Error updating task:', error);
        throw error;
    }
}

async function updateJobById(jobId: string, updateData: Partial<IJob>, session: mongoose.ClientSession | null = null) {
    console.log("Updating job")
    try {
        const updatedJob = await Job.findOneAndUpdate(
            { _id: jobId },
            { $set: updateData },
            { new: true, session } // returns the updated document
        );

        if (!updatedJob) {
            throw new Error('Job not found');
        }

        console.log("updated job")
        return updatedJob;
    } catch (error) {
        console.error('Error updating job:', error);
        throw error;
    }
}

async function updateMasterJobById(masterJobId: string, updateData: Partial<IMasterJob>, session: mongoose.ClientSession | null = null) {
    console.log("Updating Master job")
    try {
        const updatedMasterJob = await MasterJob.findOneAndUpdate(
            { _id: masterJobId },
            { $set: updateData },
            { new: true, session } // returns the updated document
        );

        if (!updatedMasterJob) {
            throw new Error('Master Job not found');
        }

        console.log("updated master job")
        return updatedMasterJob;
    } catch (error) {
        console.error('Error updating job:', error);
        throw error;
    }
}

/**
 * Atomically acquires a task if it's not in the 'Completed' state.
 * @param taskId The ID of the task to acquire.
 * @returns An object with information about the operation's outcome.
 */
export const acquireTask = async (taskId: string, session: mongoose.ClientSession | null = null): Promise<{ success: boolean; message: string; task?: any }> => {
    try {
        const updatedTask = await Task.findOneAndUpdate(
            { _id: taskId, status: { $ne: TaskStatus.COMPLETED } },
            { $set: { status: TaskStatus.SCHEDULED, startTime: new Date().toISOString() } },
            { new: true, session }
        );

        if (!updatedTask) {
            return { success: false, message: `Task with ID ${taskId} is already completed or does not exist.` };
        }

        console.log("Acquired Task!");
        return { success: true, message: "Task acquired successfully", task: updatedTask };
    } catch (error: any) {
        console.error(error);
        throw new Error(`An error occurred while acquiring the task: ${error.message}`);
    }
};


export const completeTask = async (taskId: string, output: string[]) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const task = await updateTaskById(taskId, {
            status: TaskStatus.COMPLETED,
            output: output,
            endTime: new Date().toISOString()
        }, session);

        console.log(`Completed Task ${taskId}`);

        const job = await Job.findOneAndUpdate(
            { _id: task.jobId },
            { $inc: { 'pendingTasks': -1 } }
        )

        // if (job?.pendingTasks == 0) {
        //     console.log("all tasks for job are completed, update Job");
        //     const tasks = await Task.find({
        //         jobId: task.jobId,
        //         status: TaskStatus.COMPLETED
        //     }, null, { session });
        //     const combinedOutput = tasks.flatMap(x => x.output || []);
        //     job.status = JobStatus.COMPLETED;
        //     job.output = combinedOutput;
        //     job.save({ session })

        //     if (combinedOutput.length == 1) {
        //         console.log(combinedOutput);
        //         console.log("Master Job finished");
        //         await updateMasterJobById(job.masterId, {
        //             status: MasterJobStatus.COMPLETED,
        //             output: combinedOutput
        //         }, session);
        //     } else {
        //         await createJob(job.masterId, combinedOutput, session);
        //     }
        // }

        // const result = await Task.aggregate([
        //     { $match: { jobId: task.jobId } },
        //     { $group: { _id: "$jobId", allCompleted: { $min: { $cond: [{ $eq: ["$status", TaskStatus.COMPLETED] }, 1, 0] } } } }
        // ], { session, readConcern: { level: "majority" } });

        // console.log(`${taskId} ${JSON.stringify(result)}`);

        // if (result.length > 0 && result[0].allCompleted === 1) {
        //     console.log("all tasks for job are completed, update Job");
        //     const tasks = await Task.find({
        //         jobId: task.jobId,
        //         status: TaskStatus.COMPLETED
        //     }, null, { session });

        //     const combinedOutput = tasks.flatMap(x => x.output || []);
        //     const finishedJob = await updateJobById(task.jobId, {
        //         status: JobStatus.COMPLETED,
        //         output: combinedOutput
        //     }, session);

        //     if (combinedOutput.length == 1) {
        //         console.log(combinedOutput);
        //         console.log("Master Job finished");
        //         await updateMasterJobById(finishedJob.masterId, {
        //             status: MasterJobStatus.COMPLETED,
        //             output: combinedOutput
        //         }, session);
        //     } else {
        //         await createJob(finishedJob.masterId, combinedOutput, session);
        //     }
        // }

        await session.commitTransaction();
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function checkForFinishedJobs() {
    try {
        const completedJobs = await Job.find({ pendingTasks: 0, status: { $ne: JobStatus.COMPLETED } });
        await Promise.all(completedJobs.map(async (job) => {
            try {
                const tasks = await Task.find({ jobId: job._id }).select("output");
                const combinedTaskOutput = tasks.flatMap(x => x.output || []);

                job.output = combinedTaskOutput;
                job.status = JobStatus.COMPLETED;
                await job.save();

                if (combinedTaskOutput.length === 1) {
                    console.log("Master Job finished");
                    await updateMasterJobById(job.masterId, {
                        status: MasterJobStatus.COMPLETED,
                        output: combinedTaskOutput
                    });
                } else {
                    await createJob(job.masterId, combinedTaskOutput);
                }
            } catch (innerError) {
                console.error(`Error processing job ${job._id}: ${innerError}`);
            }
        }));

        console.log('Completed checking for finished jobs');
    } catch (error) {
        console.error(`Error in checkForFinishedJobs: ${error}`);
    } finally {
        await sleep(5000); // Wait for 5 seconds
        checkForFinishedJobs(); // Schedule next execution
    }
}

// Initial call to start the process
checkForFinishedJobs();

/**
 * Create a job and partition tasks
 */
export const createJob = async (masterId: string, input: string[], session: mongoose.ClientSession | null = null) => {
    try {
        const tasks = partitionArray(input, MAX_TASK_PARTITION_SIZE);
        const job = new Job({ status: JobStatus.PENDING, input, masterId, pendingTasks: tasks.length });

        // Pass the session to the save method
        const result = await job.save({ session: session });

        const scheduledTasks = await Promise.all(tasks.map(task => {
            const taskDoc = new Task({
                status: TaskStatus.SCHEDULED,
                jobId: result._id,
                input: task
            });
            // Pass the session to each task save
            return taskDoc.save({ session: session });
        }));

        console.log(JSON.stringify(scheduledTasks));

        // Make sure scheduleTasksBatch can handle sessions if needed
        await scheduleTasksBatch(scheduledTasks);

        return job;
    } catch (error) {
        console.error('Error creating job', error);
        throw error;
    }
};

export const createMasterJob = async (input: string[], session: mongoose.ClientSession | null = null) => {
    try {
        console.log("Master job started")
        const masterJob = new MasterJob({ status: MasterJobStatus.PENDING, input });
        const result = await masterJob.save({ session: session });

        await createJob(result._id, input, session)

        return masterJob;
    } catch (error) {
        console.error('Error creating master job', error);
        throw error;
    }
}

export async function notifyMaster(masterId: string, output: string[]) {
    const channel = await connectRabbitMQ();
    const queue = 'master_queue'; // Name of the queue

    await channel.assertQueue(queue, {
        durable: true // Ensures that the queue is not lost even if RabbitMQ restarts
    });


    const msg = JSON.stringify({
        masterId,
        output
    }); // Convert task object to string
    channel.sendToQueue(queue, Buffer.from(msg), {
        persistent: true // Marks message as persistent
    });

    console.log("notified master");

    setTimeout(() => {
        channel.close(); // Close channel after messages are sent
    }, 500);
}

/**
 * Publishes a batch of tasks to a RabbitMQ queue
 * @param tasks - An array of task objects to be published
 */
export async function scheduleTasksBatch(tasks: ITask[]) {
    const channel = await connectRabbitMQ();
    const queue = 'task_queue'; // Name of the queue

    await channel.assertQueue(queue, {
        durable: true // Ensures that the queue is not lost even if RabbitMQ restarts
    });

    tasks.forEach(task => {
        const msg = JSON.stringify(task); // Convert task object to string
        channel.sendToQueue(queue, Buffer.from(msg), {
            persistent: true // Marks message as persistent
        });
    });

    console.log(" [x] Sent '%d' messages in a batch", tasks.length);

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

function masterJobMonitorQueue() {
    // TODO: handle scheduling and recheduling with backup tasks
}


app.post('/tasks/:taskId/acquire', async (req, res) => {
    const taskId = req.params.taskId;

    try {
        const result = await acquireTask(taskId);
        if (result) {
            res.status(200).json({ message: "Task acquired successfully", task: result });
        } else {
            res.status(404).json({ message: "Task already completed or does not exist" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "An error occurred while acquiring the task" });
    }
});

// Endpoint to complete a task
app.post('/tasks/:taskId/complete', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        const { output } = req.body;
        if (!Array.isArray(output)) {
            return res.status(400).json({ error: 'Output must be an array' });
        }
        const result = await completeTask(taskId, output);
        res.status(200).json({ message: "success" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/create-job', async (req, res) => {
    try {
        const input = req.body.input;
        const masterId = req.body.masterId;
        if (!Array.isArray(input)) {
            return res.status(400).send('Input must be an array of strings.');
        }

        const job = await createJob(masterId, input);
        res.status(200).json({ jobId: job._id });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


app.post('/create-master-job', async (req, res) => {
    try {
        const input = req.body.input.map((inp: string) => inp);
        if (!Array.isArray(input)) {
            return res.status(400).send('Input must be an array of strings.');
        }

        const job = await createMasterJob(input);
        res.status(200).json({ jobId: job._id });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});




console.log(DBHOST)
// MongoDB connection initialization
mongoose.connect(DBHOST)
    .then(() => {
        console.log("MongoDB connected")
    })
    .catch(err => console.error('Error connecting to MongoDB', err));
