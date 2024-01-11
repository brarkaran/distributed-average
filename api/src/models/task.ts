import mongoose, { Schema, Document } from 'mongoose';

export enum TaskStatus {
    STARTED = "STARTED",
    COMPLETED = "COMPLETED",
    SCHEDULED = "SCHEDULED"
}

export interface ITask extends Document {
    status: TaskStatus;
    jobId: string,
    input: Array<string>,
    startTime?: string; // time when task started by a worker (not when scheduled)
    endTime?: string; // time when task completed
    output?: Array<string>;
}

// Schema definition for the Task model
const TaskSchema: Schema = new Schema({
    status: { type: String, required: true },
    input: { type: Array<string>, required: true },
    jobId: { type: String, required: true },
    startTime: { type: Date, default: null },
    endTime: { type: Date, default: null },
    output: { type: Array<string>, default: null }
}, { timestamps: true });

TaskSchema.set('toJSON', {
    virtuals: true,
    transform: function (doc, ret, options) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
    }
});
// Model creation
export const Task = mongoose.model<ITask>('Task', TaskSchema);