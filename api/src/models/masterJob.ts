import mongoose, { Schema, Document } from 'mongoose';

export enum MasterJobStatus {
    PENDING = "PENDING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED"
}

export interface IMasterJob extends Document {
    status: MasterJobStatus;
    input: Array<string>; // path to files in S3
    output?: Array<string>; // path to resulting file in S3
}

// Schema definition for the MasterJob model
const MasterJobSchema: Schema = new Schema({
    status: { type: String, enum: Object.values(MasterJobStatus), required: true },
    input: [{ type: String, required: true }], // Array of strings
    output: [{ type: String, default: null }],
}, { timestamps: true });

MasterJobSchema.set('toJSON', {
    virtuals: true,
    transform: function (doc, ret, options) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
    }
});

// Model creation
export const MasterJob = mongoose.model<IMasterJob>('MasterJob', MasterJobSchema);