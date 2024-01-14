export interface IQueueService {
    sendMessages(queue: string, messages: any[]): Promise<void>;
}
