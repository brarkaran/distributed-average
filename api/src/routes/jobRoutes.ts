import express from "express";
import { IJobService } from "../interfaces/jobService";

module.exports = (jobService: IJobService) => {
    const router = express.Router();
    router.get('/job', async (req: any, res: any) => {
        const jobs = jobService.getJobs();
        res.status(200).json(jobs);
    });
    router.get('/job/:jobId', async (req: any, res: any) => {
        const jobId = req.params.jobId;
        const job = jobService.getJob(jobId);
        if (!job) {
            res.status(404).json({ message: "Job not found" });
            return;
        }
        res.status(200).json(job);
    });
    return router;
};