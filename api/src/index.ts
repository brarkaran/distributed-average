import express, { Request, Response } from 'express';
import { KubeConfig, BatchV1Api, V1Job } from '@kubernetes/client-node';

const app = express();
app.use(express.json());

const kubeConfig = new KubeConfig();
kubeConfig.loadFromDefault();
const k8sApi = kubeConfig.makeApiClient(BatchV1Api);

app.post('/create-job', async (req: Request, res: Response) => {
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

app.post('/submit-job', async (req: Request, res: Response) => {
    const numWorkers = req.body.numWorkers || 1;
    const { files, count } = req.body;

    try {
        await k8sApi.createNamespacedJob('default', jobManifest); // Replace 'default' with your namespace if different
        res.status(200).json({ message: `Job ${jobName} created with ${numWorkers} workers` });
    } catch (error) {
        console.error("Error creating Kubernetes job:", error);
        res.status(500).json({ error: "Failed to create job on Kubernetes cluster" });
    }
})

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`API Server running on port ${PORT}`);
});