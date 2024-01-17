import express from "express";
import { MasterService } from "../services/masterService";

module.exports = (masterService: MasterService) => {
    const router = express.Router();
    router.post('/jobs/schedule', async (req: any, res: any) => {
        console.log("Received request to schedule job");
        const input = req.body.input;
        if (!input) {
            res.status(400).json({ message: "Missing input field" });
            return;
        }
        const job = await masterService.scheduleJob(input);
        res.status(200).json({ message: "Job scheduled", job });
    });
    router.post('/jobs/:jobId/tasks/:taskId/start', async (req: any, res: any) => {
        
        const taskId = req.params.taskId;
        console.log(`Received request to start task ${taskId}`);
        const jobId = req.params.jobId;
        const task = masterService.startTask(jobId, taskId);
        if (!task) {
            res.status(404).json({ message: "Task not found" });
            return;
        }
        res.status(200).json(task);
    }
    );
    router.post('/jobs/:jobId/tasks/:taskId/complete', async (req: any, res: any) => {
        const taskId = req.params.taskId;
        console.log(`Received request to complete task ${taskId} with output ${req.body.output}`);
        const jobId = req.params.jobId;
        const output = req.body.output;
        if (!output) {
            res.status(400).json({ message: "Missing output field" });
            return;
        }
        await masterService.completeTask(jobId, taskId, output);
        res.status(200).json({ message: "Task completed" });
    }
    );
    return router;
};