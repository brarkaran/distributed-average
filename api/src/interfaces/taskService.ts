// src/interfaces/ITaskService.ts
import { Task, TaskStatus } from '../models/task';

export interface ITaskService {
    addTask(task: Omit<Task, "id" | "startTime" | "endTime" | "duration" | "output" | "status">): Task;
    startTask(taskId: string): Task | null;
    finishTask(taskId: string, output: string[]): Task | null;
    getTask(taskId: string): Task | null;
    getTasks(): Task[]
    getTasksForJob(jobId: string): Task[];
    updateTask(taskId: string, updatedFields: Partial<Task>): Task | null;
    removeTask(taskId: string): boolean;
}
