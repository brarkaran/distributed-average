import { v4 as uuidv4 } from 'uuid';
import { Job, JobStatus } from '../models/job';
import { IJobService } from '../interfaces/jobService';

export class JobService implements IJobService {
    private jobs: Map<string, Job>;

    constructor() {
        this.jobs = new Map<string, Job>();
    };
    addJob(job: Omit<Job, "id" | "startTime" | "endTime" | "duration" | "output" | "status">): Job {
        const newJob: Job = {
            id: uuidv4(),
            input: job.input,
            startTime: new Date().getTime(),
            status: JobStatus.PENDING
        };
        this.jobs.set(newJob.id, newJob);
        return newJob;
    };
    updateJob(jobId: string, updatedFields: Partial<Job>): Job | null {
        const job = this.jobs.get(jobId);
        if (!job) {
            return null;
        }
        const updatedJob = { ...job, ...updatedFields };
        this.jobs.set(jobId, updatedJob);
        return updatedJob;
    };
    completeJob(jobId: string, output: string[]): Job | null {
        const job = this.jobs.get(jobId);
        if (!job) {
            return null;
        }
        const endTime = new Date().getTime();
        const updatedJob = { ...job, status: JobStatus.COMPLETED, output: output, endTime: endTime, duration: endTime - job.startTime! };
        this.jobs.set(jobId, updatedJob);
        return updatedJob;
    };
    getJob(jobId: string): Job | null {
        const job = this.jobs.get(jobId);
        return job ? job : null;
    };
    getJobs(): Job[] {
        return [...this.jobs.values()];
    };
}
