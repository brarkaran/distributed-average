// src/interfaces/IJobService.ts
import { Job } from '../models/job';

export interface IJobService {
    addJob(job: Omit<Job, "id" | "startTime" | "endTime" | "duration" | "output" | "status">): Job;
    updateJob(jobId: string, updatedFields: Partial<Job>): Job | null;
    completeJob(jobId: string, output: string[]): Job | null;
    getJob(jobId: string): Job | null;
    getJobs(): Job[];
}

