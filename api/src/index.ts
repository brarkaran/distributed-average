import express, { Request, Response } from 'express';
import bodyParser from 'body-parser'
import { MasterService } from './services/masterService';
import { WorkerService } from './services/workerService';
import { FileGenerator, LocalStorageStrategy, S3StorageStrategy } from './services/fileGeneratorService';
import { JobService } from './services/jobService';
import { TaskService } from './services/taskService';
import { RabbitMQService } from './services/rabbitMQService';

const cors = require('cors');


if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config('../.env');
}

const WORKER_QUEUE = process.env.WORKER_QUEUE || 'worker-queue';
const OUTPUT_QUEUE = process.env.OUTPUT_QUEUE || 'output-queue';
const RABBIT_HOST = process.env.RABBIT_HOST || 'localhost';

const queueService = new RabbitMQService(RABBIT_HOST);
const workerService = new WorkerService();
const jobService = new JobService();
const taskService = new TaskService();
const masterService = new MasterService(jobService, taskService, workerService, queueService, OUTPUT_QUEUE, WORKER_QUEUE, 5);
const fileGenerator = new FileGenerator(new S3StorageStrategy(process.env.AWS_BUCKET_NAME!, "dynamofl-inputs"));

const app = express();
app.use(express.json({
    limit: '100mb'
}));
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(cors());
app.use(require('./routes/masterRoutes')(masterService));
app.use(require('./routes/workerRoutes')(workerService));
app.use(require('./routes/fileGeneratorRoutes')(fileGenerator));
app.use(require('./routes/jobRoutes')(jobService));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`API Server running on port ${PORT}`);
});
