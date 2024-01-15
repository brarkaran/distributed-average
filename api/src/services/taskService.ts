import { v4 as uuidv4 } from 'uuid';
import { Task, TaskStatus } from '../models/task';
import { ITaskService } from '../interfaces/taskService';


export class TaskService implements ITaskService {
    private tasks: Map<string, Task>;

    constructor() {
        this.tasks = new Map<string, Task>();
    };
    addTask(task: Omit<Task, "id" | "startTime" | "endTime" | "duration" | "output" | "status">): Task {
        const newTask: Task = {
            id: uuidv4(),
            jobId: task.jobId,
            input: task.input,
            status: TaskStatus.PENDING
        };
        this.tasks.set(newTask.id, newTask);
        console.log("Task added: ", newTask)
        return newTask;
    };
    updateTask(taskId: string, updatedFields: Partial<Task>): Task | null {
        const task = this.tasks.get(taskId);
        if (!task) {
            return null;
        }
        const updatedJob = { ...task, ...updatedFields };
        this.tasks.set(taskId, updatedJob);
        return updatedJob;
    };
    startTask(taskId: string): Task | null {
        const task = this.tasks.get(taskId);
        // can only acquire tasks that are not completed
        // tasks can be acquired if they're IN_PROGRESS to allow for speculative execution
        if (!task || task.status == TaskStatus.COMPLETED) {
            return null;
        }
        const updatedTask = { ...task, status: TaskStatus.IN_PROGRESS, startTime: new Date().getTime() };
        this.tasks.set(taskId, updatedTask);
        return updatedTask;
    };
    finishTask(taskId: string, output: string[]): Task | null {
        const task = this.tasks.get(taskId);
        if (!task || task.status == TaskStatus.COMPLETED) {
            return null;
        }
        const endTime = new Date().getTime();
        const updatedTask = { ...task, status: TaskStatus.COMPLETED, output: output, endTime: endTime, duration: endTime - task.startTime! };
        this.tasks.set(taskId, updatedTask);
        return updatedTask;
    };
    getTask(taskId: string): Task | null {
        const task = this.tasks.get(taskId);
        return task ? task : null;
    };
    getTasks(): Task[] {
        return [...this.tasks.values()];
    };
    getTasksForJob(jobId: string): Task[] {
        return this.getTasks().filter(task => task.jobId === jobId);
    }
    removeTask(taskId: string): boolean {
        return this.tasks.delete(taskId);
    }
}
