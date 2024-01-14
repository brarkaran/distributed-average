// import { ITaskService } from "../interfaces/ITaskService";
// import { IQueueService } from "../interfaces/IQueueService";
// import { TaskStatus } from "../models/task";

// export class TaskMonitor {
//     constructor(
//         private taskService: ITaskService,
//         private queueService: IQueueService,
//         private workerQueue: string,
//         private retryInterval: number // This could be a predefined constant or configurable
//     ) { }

//     /**
//      * Periodically checks the status of tasks and retries them if necessary.
//      */
//     public startMonitoring() {
//         setInterval(() => {
//             this.checkAndRetryTasks();
//         }, this.retryInterval);
//     }

//     private async checkAndRetryTasks() {
//         const tasks = await this.taskService.getStaleTasks(); // Method to get tasks that are overdue
//         tasks.forEach(task => {
//             if (this.shouldRetry(task)) {
//                 this.retryTask(task);
//             }
//         });
//     }

//     private shouldRetry(task: Task): boolean {
//         // Logic to determine if a task should be retried
//         // This could be based on how long the task has been in a pending state,
//         // how many times it has been retried, etc.
//     }

//     private async retryTask(task: Task) {
//         // Logic to retry a task
//         await this.queueService.sendMessages(this.workerQueue, [task]);
//         this.taskService.updateTaskStatus(task.id, TaskStatus.RETRY);
//     }
// }
