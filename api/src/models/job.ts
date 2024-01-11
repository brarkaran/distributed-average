import mongoose, { Schema, Document } from 'mongoose';

export enum JobStatus {
    PENDING = "PENDING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED"
}

export interface IJob extends Document {
    masterId: string,
    status: JobStatus;
    pendingTasks: number,
    input: Array<string>; // path to files in S3
    output?: Array<string>; // path to resulting file in S3
}

// Schema definition for the Job model
const JobSchema: Schema = new Schema({
    masterId: { type: String, required: true },
    pendingTasks: { type: Number, required: true },
    status: { type: String, enum: Object.values(JobStatus), required: true },
    input: [{ type: String, required: true }], // Array of strings
    output: [{ type: String, default: null }],
}, { timestamps: true });

JobSchema.set('toJSON', {
    virtuals: true,
    transform: function (doc, ret, options) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
    }
});

// Model creation
export const Job = mongoose.model<IJob>('Job', JobSchema);