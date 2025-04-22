import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

interface DocumentAccess {
    userId: string;
    accessDate: Date;
}

@Schema({ timestamps: true })
export class SignatureHistory extends Document {
    @Prop({ required: true })
    envelopeId: string;

    @Prop({ required: true })
    userId: string;

    @Prop({ required: true })
    signerEmail: string;

    @Prop({ required: true })
    signerName: string;

    @Prop({ required: true })
    title: string;

    @Prop({ default: 'created' })
    status: string;

    @Prop()
    completedAt: Date;

    @Prop()
    documentUrl: string;

    @Prop({ type: [{ userId: String, accessDate: Date }], default: [] })
    documentAccesses: DocumentAccess[];
}

export const SignatureHistorySchema = SchemaFactory.createForClass(SignatureHistory);