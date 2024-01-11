import mongoose from 'mongoose';
import amqp from 'amqplib';
import { Db } from 'mongodb';
import { Job, JobStatus } from '../models/job';
import { ITask, Task, TaskStatus } from '../models/task';

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


/**
 * Create a job and partition tasks
 */
export const createJob = async (input: string[]) => {
    try {
        const job = new Job({ status: JobStatus.PENDING, input });
        const result = await job.save();

        const tasks = partitionArray(input, MAX_TASK_PARTITION_SIZE);
        const scheduledTasks = await Promise.all(tasks.map(task => {
            const taskDoc = new Task({
                status: TaskStatus.SCHEDULED,
                jobId: result._id,
                input: task
            });
            return taskDoc.save();
        }));

        await scheduleTasksBatch(scheduledTasks);

        return job;
    } catch (error) {
        console.error('Error creating job', error);
        throw error;
    }
};

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
