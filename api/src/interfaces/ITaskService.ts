// src/interfaces/ITaskService.ts
import { Task, TaskStatus } from '../models/Task';

export interface ITaskService {
    addTask(task: Omit<Task, "id" | "startTime" | "endTime" | "duration" | "output" | "status">): Task;
    startTask(taskId: string): Task | null;
    finishTask(taskId: string, output: string[]): Task | null;
    getTask(taskId: string): Task | null;
    getTasks(): Task[]
    removeTask(taskId: string): boolean;
}
