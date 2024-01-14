// src/services/QueueService.ts
import { IQueueService } from '../interfaces/IQueueService';
import amqp from 'amqplib';

export class RabbitMQService implements IQueueService {
    private channel: any;

    constructor(private rabbitUrl: string) {
        this.rabbitUrl = rabbitUrl;
        this.init();
    }

    private async init() {
        const connection = await amqp.connect(this.rabbitUrl);
        this.channel = await connection.createChannel();
    }

    async sendMessages(queueName: string, messages: Array<unknown>) {
        await this.channel.assertQueue(queueName, { durable: true });
        for (const message of messages) {
            const msg = JSON.stringify(message);
            this.channel.sendToQueue(queueName, Buffer.from(msg), { persistent: true });
        }
    }

}